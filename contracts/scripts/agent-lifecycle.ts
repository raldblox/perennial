/**
 * agent-lifecycle.ts - an agent's whole life on the QoreChain testnet, from
 * keys to succession, as in docs/agents.md.
 *
 * Two accounts, each from its own phrase, loaded from env files only and
 * never printed: the owner (QORE_MNEMONIC in .env) and the agent
 * (AGENT_MNEMONIC in .env.agent, made by `agent-new`). The owner funds and
 * stops; the agent spends with its own ML-DSA-87 key. Inference is bought
 * from an Overwinter service through PQ-402's `perennial` scheme: each paid
 * call is one Perennial `spend`, relayed by the service.
 *
 *   pnpm agent-lifecycle <step> [args]
 *
 *   agent-new                      create .env.agent with a fresh agent phrase
 *   status                         both accounts: QOR, fUSD, keys, window
 *   fund-agent <QOR>               owner sends the agent QOR for its own fees
 *   agent-register                 agent registers its ML-DSA-87 and ML-KEM-1024 keys
 *   window-open | window-close     owner's EVM window, scoped to the vault and fUSD
 *   open <fUSD> <budget/day>       owner opens a budget-mode position for the agent
 *   pay <position> <calls>         agent pays Overwinter (OVERWINTER_URL) per call
 *   ledger <position>              owner reads the position and its events
 *   fund <position> <fUSD>         owner pays income into the position's buffer
 *   close <position>               owner closes: principal back to the owner
 *   succession                     a 60-second position that passes to its heir
 *   all                            every step above in order, with one window
 *
 * Every transaction first checks that the owner keeps MIN_QOR (default 3).
 */
import { StargateClient } from "@cosmjs/stargate";
import { createPq402Fetch } from "@pq402/client";
import { mldsaSign } from "@pq402/core";
import { EvmChainReader, qorechainTestnet } from "@pq402/scheme-qorechain";
import { evmWindowCost, evmWindowStatus } from "@qorechain/evm";
import { deriveSealKeys } from "@qorechain/qoreseal";
import { fetchMlkemPublicKey } from "@qorechain/qoreseal/network";
import {
  buildRegisterPqcKeyMsg,
  closeEvmWindowMsg,
  deriveUnifiedAccount,
  EthNativeSigner,
  fetchPqcStatus,
  getNetwork,
  msg,
  openEvmWindowMsg,
  signProofOfPossession,
  type UnifiedAccount,
} from "@qorechain/sdk";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
  parseAbi,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";

const net = getNetwork("testnet");
const REST = process.env.QORE_REST_URL?.trim() || net.endpoints.rest;
const RPC = process.env.QORE_RPC_URL?.trim() || net.endpoints.rpc;
const EVM_RPC = "https://evm-testnet.qore.host";
/** Perennial's no-yield vault: budget mode as it runs on QoreChain today. */
const VAULT = (process.env.PERENNIAL_VAULT?.trim() || "0x76DAC5461fF361f911e5F39810c9455a6180C180") as Address;
const FUSD = "0x97143B771D34ddb9130b807b135Ae675A5a963CA" as Address;
const MIN_QOR = Number(process.env.MIN_QOR ?? "3");
const MAX_FEE = 150_000_000_000n;
const PRIORITY_FEE = 1_000_000_000n;
const DAY = 86_400n;

const chain = defineChain({
  id: 9800,
  name: "QoreChain testnet",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC] } },
});
const reader = createPublicClient({ chain, transport: http() });

const vaultAbi = parseAbi([
  "struct Heir { address account; uint16 bps; }",
  "struct OpenParams { uint256 amount; address beneficiary; uint256 payoutAmount; uint64 payoutInterval; uint64 checkInPeriod; uint64 gracePeriod; bool ownerCanClose; Heir[] heirs; uint256 bufferCap; bool budgetMode; }",
  "struct Position { address owner; address beneficiary; bool ownerCanClose; bool succeeded; bool closed; uint64 payoutInterval; uint64 checkInPeriod; uint64 gracePeriod; uint64 lastCheckIn; uint64 lastPayout; uint256 payoutAmount; uint256 principal; uint256 shares; uint256 buffer; uint256 nonce; uint256 bufferCap; bool budgetMode; uint64 windowStart; uint256 windowSpent; }",
  "function position(uint256 positionId) view returns (Position)",
  "function budgetRemaining(uint256 positionId) view returns (uint256)",
  "function actionMessage(uint256 positionId, uint8 action, uint256 nonce, uint256 deadline, bytes32 paramsHash) view returns (bytes)",
  "function open(OpenParams p) returns (uint256)",
  "function fund(uint256 positionId, uint256 amount)",
  "function triggerSuccession(uint256 positionId)",
  "function distribute(uint256 positionId) returns (uint256)",
  "function closeByOwner(uint256 positionId, uint256 deadline, bytes signature)",
  "event Opened(uint256 indexed positionId, address indexed owner, address indexed beneficiary, uint256 amount, uint256 payoutAmount, uint64 payoutInterval, uint64 checkInPeriod, uint64 gracePeriod, bool ownerCanClose, uint256 bufferCap)",
  "event Spent(uint256 indexed positionId, address indexed to, uint256 amount, bytes32 indexed ref)",
  "event Funded(uint256 indexed positionId, address indexed from, uint256 amount)",
  "event Harvested(uint256 indexed positionId, address indexed caller, uint256 yield)",
  "event PrincipalDrawn(uint256 indexed positionId, uint256 amount)",
  "event SuccessionTriggered(uint256 indexed positionId, address indexed caller)",
  "event Distributed(uint256 indexed positionId, uint256 amount, uint256 periods)",
  "event Closed(uint256 indexed positionId, address indexed owner, uint256 principalReturned, uint256 yieldPaid)",
]);
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)", "function approve(address, uint256) returns (bool)"]);

const fusd = (a: bigint) => `${(Number(a) / 1e6).toFixed(6)} fUSD`;

interface Party {
  role: "owner" | "agent";
  acc: UnifiedAccount;
  address: Address;
  phrase: string;
}

async function party(role: Party["role"]): Promise<Party> {
  const name = role === "owner" ? "QORE_MNEMONIC" : "AGENT_MNEMONIC";
  const phrase = process.env[name]?.trim();
  if (!phrase) throw new Error(`${name} is not set${role === "agent" ? " (run agent-new, then load .env.agent)" : ""}`);
  const acc = await deriveUnifiedAccount(phrase, 0);
  return { role, acc, address: acc.evm as Address, phrase };
}

async function uqor(address: string): Promise<bigint> {
  const res = await fetch(`${REST}/cosmos/bank/v1beta1/balances/${address}`);
  const body = (await res.json()) as { balances?: { denom: string; amount: string }[] };
  return BigInt(body.balances?.find((b) => b.denom === "uqor")?.amount ?? "0");
}

/** Refuses a step whose worst-case cost would take the owner below MIN_QOR. */
async function guard(owner: Party, worstCaseUqor: bigint) {
  const have = await uqor(owner.acc.cosmos);
  if (Number(have - worstCaseUqor) / 1e6 < MIN_QOR) {
    throw new Error(`stopping: the owner has ${Number(have) / 1e6} QOR; this step may cost ${Number(worstCaseUqor) / 1e6}, which would leave less than ${MIN_QOR}`);
  }
}

async function broadcast(p: Party, mode: "hybrid" | "classical", messages: Parameters<EthNativeSigner["sign"]>[0]["messages"]): Promise<string> {
  const res = await fetch(`${REST}/cosmos/auth/v1beta1/accounts/${p.acc.cosmos}`);
  const body = (await res.json()) as { account?: Record<string, unknown> };
  const a = (body.account?.base_account ?? body.account ?? {}) as Record<string, string>;
  const signer = new EthNativeSigner(p.acc, { signMode: mode, rest: REST });
  const transport = await StargateClient.connect(RPC);
  try {
    const out = await signer.signAndBroadcast(transport, {
      chainId: net.chainId,
      accountNumber: BigInt(a.account_number ?? "0"),
      sequence: BigInt(a.sequence ?? "0"),
      fee: { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" },
      messages,
    });
    return out.transactionHash;
  } finally {
    transport.disconnect();
  }
}

async function send(p: Party, label: string, request: Record<string, unknown>): Promise<Hex> {
  const wallet = createWalletClient({ account: mnemonicToAccount(p.phrase), chain, transport: http() });
  const hash = await wallet.writeContract({ ...request, maxFeePerGas: MAX_FEE, maxPriorityFeePerGas: PRIORITY_FEE } as never);
  const receipt = await reader.waitForTransactionReceipt({ hash });
  console.log(`${label}: ${hash} (${receipt.status}, gas ${receipt.gasUsed.toString()})`);
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
  return hash;
}

async function ownerSignature(owner: Party, positionId: bigint, action: number): Promise<{ deadline: bigint; signature: Hex }> {
  const pos = await reader.readContract({ address: VAULT, abi: vaultAbi, functionName: "position", args: [positionId] });
  const deadline = (await reader.getBlock()).timestamp + 600n;
  const message = await reader.readContract({ address: VAULT, abi: vaultAbi, functionName: "actionMessage", args: [positionId, action, pos.nonce, deadline, `0x${"00".repeat(32)}`] });
  return { deadline, signature: toHex(mldsaSign(owner.acc.pqc.secretKey, Uint8Array.from(Buffer.from(message.slice(2), "hex")))) };
}

/** Whether the account has an ML-KEM-1024 key in the chain's registry. */
async function hasKem(address: string): Promise<boolean> {
  return fetchMlkemPublicKey({ rest: REST, address }).then(
    () => true,
    () => false,
  );
}

// ---- steps ----

function agentNew() {
  const file = resolve(process.cwd(), ".env.agent");
  if (existsSync(file)) {
    console.log(".env.agent exists; keeping it");
    return;
  }
  writeFileSync(file, `# The agent's own testnet account. Never commit.\nAGENT_MNEMONIC=${generateMnemonic(english)}\n`, { mode: 0o600 });
  console.log("wrote .env.agent (git-ignored); load it with --env-file=.env.agent");
}

async function status() {
  for (const role of ["owner", "agent"] as const) {
    const p = await party(role).catch(() => undefined);
    if (!p) continue;
    const pqc = await fetchPqcStatus({ rest: REST, address: p.acc.cosmos });
    const kem = await hasKem(p.acc.cosmos);
    const fusdBalance = await reader.readContract({ address: FUSD, abi: erc20Abi, functionName: "balanceOf", args: [p.address] });
    const w = await evmWindowStatus({ rest: REST, address: p.acc.cosmos });
    console.log(`${role}: ${p.address} (${p.acc.cosmos})`);
    console.log(`  QOR ${Number(await uqor(p.acc.cosmos)) / 1e6}, ${fusd(fusdBalance)}, EVM nonce ${(await reader.getTransactionCount({ address: p.address })).toString()}`);
    console.log(`  ML-DSA-87 ${pqc.registered ? "registered" : "not registered"}; ML-KEM-1024 ${kem ? "registered" : "not registered"}`);
    console.log(`  EVM window ${w.found ? `${w.live ? "live" : "not usable"}, ${String(w.remainingTxs)} txs left` : "none"}`);
  }
}

async function fundAgent(amount = "0.5") {
  const [owner, agent] = [await party("owner"), await party("agent")];
  const value = BigInt(Math.round(Number(amount) * 1e6));
  if (value > 1_000_000n) throw new Error("fund-agent sends at most 1 QOR");
  await guard(owner, value + 100_000n);
  const m = msg.bank.send({ fromAddress: owner.acc.cosmos, toAddress: agent.acc.cosmos, amount: [{ denom: "uqor", amount: value.toString() }] });
  console.log(`owner sent the agent ${amount} QOR: ${await broadcast(owner, "hybrid", [m])}`);
}

async function agentRegister() {
  const agent = await party("agent");
  const pqc = await fetchPqcStatus({ rest: REST, address: agent.acc.cosmos });
  if (!pqc.registered) {
    // The one message the chain accepts signed classically: it carries a proof of possession.
    const proof = signProofOfPossession({ chainId: net.chainId, account: agent.acc.cosmos, keypair: agent.acc.pqc });
    console.log(`agent registered its ML-DSA-87 key: ${await broadcast(agent, "classical", [buildRegisterPqcKeyMsg(agent.acc.cosmos, { pqcKeypair: agent.acc.pqc, proofOfPossession: proof })])}`);
    await new Promise((r) => setTimeout(r, 6_000));
  } else console.log("agent's ML-DSA-87 key already registered");
  const kem = await hasKem(agent.acc.cosmos);
  if (kem) {
    console.log("agent's ML-KEM-1024 key already registered");
    return;
  }
  const seal = deriveSealKeys({ mnemonic: agent.phrase });
  const m = msg.pqc.registerKemKey({ sender: agent.acc.cosmos, algorithmId: 2, publicKey: seal.mlkemPublicKey });
  console.log(`agent registered its ML-KEM-1024 key: ${await broadcast(agent, "hybrid", [m])}`);
}

async function windowOpen(maxTxs = "12") {
  const owner = await party("owner");
  const txs = BigInt(maxTxs);
  // The window can never spend more than this, so the owner's floor holds whatever happens.
  const cap = BigInt(process.env.WINDOW_MAX_UQOR ?? "1000000");
  const sized = evmWindowCost({ gas: 600_000n, maxFeePerGas: MAX_FEE }) * txs;
  const maxValue = sized < cap ? sized : cap;
  await guard(owner, maxValue + 200_000n);
  const m = openEvmWindowMsg({ sender: owner.acc.cosmos, blocks: 3_000n, maxTxs: txs, maxValue, allowedTargets: [VAULT, FUSD] });
  console.log(`owner opened an EVM window (${maxTxs} txs, scoped to ${VAULT} and ${FUSD}): ${await broadcast(owner, "hybrid", [m])}`);
}

async function windowClose() {
  const owner = await party("owner");
  console.log(`owner closed the EVM window: ${await broadcast(owner, "hybrid", [closeEvmWindowMsg(owner.acc.cosmos)])}`);
}

async function open(amount = "0.05", perDay = "0.01", heirs: { account: Address; bps: number }[] = [], checkIn = 30n * DAY, grace = 7n * DAY, interval = DAY): Promise<bigint> {
  const [owner, agent] = [await party("owner"), await party("agent")];
  const principal = parseUnits(amount, 6);
  const budget = parseUnits(perDay, 6);
  if (principal > 1_000_000n) throw new Error("this script deposits at most 1 fUSD");
  await guard(owner, 2n * evmWindowCost({ gas: 600_000n, maxFeePerGas: MAX_FEE }));
  await send(owner, `owner approved exactly ${fusd(principal)}`, { address: FUSD, abi: erc20Abi, functionName: "approve", args: [VAULT, principal], gas: 80_000n });
  const params = {
    amount: principal,
    beneficiary: agent.address,
    payoutAmount: budget,
    payoutInterval: interval,
    checkInPeriod: checkIn,
    gracePeriod: grace,
    ownerCanClose: true,
    heirs: heirs.length ? heirs : [{ account: owner.address, bps: 10_000 }],
    bufferCap: 2n ** 256n - 1n,
    budgetMode: true,
  } as const;
  const { result: positionId } = await reader.simulateContract({ account: owner.address, address: VAULT, abi: vaultAbi, functionName: "open", args: [params] });
  await send(owner, `owner opened position ${positionId.toString()} for the agent: ${fusd(principal)}, budget mode, at most ${fusd(budget)} per ${interval.toString()} s`, { address: VAULT, abi: vaultAbi, functionName: "open", args: [params], gas: 600_000n });
  return positionId;
}

async function pay(positionArg?: string, callsArg = "2") {
  if (!positionArg) throw new Error("pay <position> <calls>");
  const url = process.env.OVERWINTER_URL?.trim();
  if (!url) throw new Error("set OVERWINTER_URL to a running Overwinter service (see docs/agents.md)");
  const agent = await party("agent");
  const paying = createPq402Fetch({
    payer: agent.address,
    mldsaSecretKey: agent.acc.pqc.secretKey,
    sealKeys: deriveSealKeys({ mnemonic: agent.phrase }),
    keys: new EvmChainReader({ network: qorechainTestnet }),
    chainId: net.chainId,
    maxAmount: 5_000n,
    perennial: { positionId: BigInt(positionArg) },
  });
  for (let n = 1; n <= Number(callsArg); n++) {
    const body = JSON.stringify({ model: "overwinter-local", messages: [{ role: "user", content: `Call ${n.toString()}: what does one call cost?` }] });
    const res = await paying(`${url.replace(/\/+$/, "")}/m/overwinter-local/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body });
    const answer = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const p = res.payment;
    console.log(`agent call ${n.toString()}: ${res.status.toString()} "${answer.choices?.[0]?.message?.content?.slice(0, 80) ?? ""}"`);
    console.log(`  paid ${fusd(BigInt(p?.requirements.amount ?? "0"))} with ${p?.requirements.scheme ?? "?"}: ${p?.settlement.transaction ?? "no settlement"}; prompt sealed ${String(p?.requestSealed)}; receipt ${p?.receipt ? "verified" : "missing"}`);
  }
}

async function ledger(positionArg?: string) {
  if (!positionArg) throw new Error("ledger <position>");
  const id = BigInt(positionArg);
  const p = await reader.readContract({ address: VAULT, abi: vaultAbi, functionName: "position", args: [id] });
  const left = await reader.readContract({ address: VAULT, abi: vaultAbi, functionName: "budgetRemaining", args: [id] });
  console.log(`position ${positionArg}: principal ${fusd(p.principal)}, buffer ${fusd(p.buffer)}, budget left this window ${fusd(left)}, nonce ${p.nonce.toString()}, succeeded ${String(p.succeeded)}, closed ${String(p.closed)}`);
  const latest = await reader.getBlockNumber();
  for (let from = latest - 40_000n; from <= latest; from += 10_000n) {
    const logs = await reader.getLogs({ address: VAULT, fromBlock: from, toBlock: from + 9_999n > latest ? latest : from + 9_999n });
    for (const log of logs) {
      try {
        const e = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics });
        if ((e.args as { positionId?: bigint }).positionId !== id) continue;
        const a = e.args as Record<string, unknown>;
        const amount = a.amount ?? a.principalReturned ?? a.yield;
        console.log(`  block ${String(log.blockNumber)} ${e.eventName}${typeof amount === "bigint" ? ` ${fusd(amount)}` : ""}${a.ref ? ` ref ${String(a.ref)}` : ""} tx ${String(log.transactionHash)}`);
      } catch {
        // another event of the vault
      }
    }
  }
}

async function fund(positionArg?: string, amount = "0.01") {
  if (!positionArg) throw new Error("fund <position> <fUSD>");
  const owner = await party("owner");
  const value = parseUnits(amount, 6);
  await guard(owner, 2n * evmWindowCost({ gas: 300_000n, maxFeePerGas: MAX_FEE }));
  await send(owner, `owner approved exactly ${fusd(value)}`, { address: FUSD, abi: erc20Abi, functionName: "approve", args: [VAULT, value], gas: 80_000n });
  await send(owner, `owner paid ${fusd(value)} of income into position ${positionArg}`, { address: VAULT, abi: vaultAbi, functionName: "fund", args: [BigInt(positionArg), value], gas: 250_000n });
}

async function close(positionArg?: string) {
  if (!positionArg) throw new Error("close <position>");
  const owner = await party("owner");
  await guard(owner, evmWindowCost({ gas: 400_000n, maxFeePerGas: MAX_FEE }));
  const { deadline, signature } = await ownerSignature(owner, BigInt(positionArg), 3);
  await send(owner, `owner closed position ${positionArg} (ML-DSA-87 signed)`, { address: VAULT, abi: vaultAbi, functionName: "closeByOwner", args: [BigInt(positionArg), deadline, signature], gas: 450_000n });
}

/** A position whose agent goes silent for a minute: anyone triggers succession, the heir is paid. */
async function succession() {
  const owner = await party("owner");
  const id = await open("0.01", "0.001", [{ account: owner.address, bps: 10_000 }], 60n, 0n, 60n);
  console.log("waiting 75 s: the agent does not check in");
  await new Promise((r) => setTimeout(r, 75_000));
  await send(owner, `anyone (here the owner's account) triggered succession of position ${id.toString()}`, { address: VAULT, abi: vaultAbi, functionName: "triggerSuccession", args: [id], gas: 200_000n });
  await send(owner, `anyone distributed position ${id.toString()} to its heirs`, { address: VAULT, abi: vaultAbi, functionName: "distribute", args: [id], gas: 400_000n });
  await ledger(id.toString());
  await close(id.toString());
}

async function all() {
  await status();
  await fundAgent("0.3");
  await new Promise((r) => setTimeout(r, 6_000));
  await agentRegister();
  await windowOpen("12");
  try {
    await new Promise((r) => setTimeout(r, 6_000));
    const id = await open("0.05", "0.01");
    // Income first: a spend paid from the buffer stays well inside a relayer's gas limit;
    // one that draws on principal redeems from the source and costs more (docs/agents.md).
    await fund(id.toString(), "0.01");
    await pay(id.toString(), "2");
    await ledger(id.toString());
    await close(id.toString());
    await succession();
  } finally {
    await windowClose();
  }
  await status();
}

const steps: Record<string, (...args: string[]) => Promise<unknown> | void> = {
  "agent-new": agentNew,
  status,
  "fund-agent": fundAgent,
  "agent-register": agentRegister,
  "window-open": windowOpen,
  "window-close": windowClose,
  open: (a, b) => open(a, b).then((id) => console.log(`position ${id.toString()}`)),
  pay,
  ledger,
  fund,
  close,
  succession,
  all,
};

const [step, ...args] = process.argv.slice(2);
const fn = step ? steps[step] : undefined;
if (!fn) {
  console.error(`steps: ${Object.keys(steps).join(", ")}`);
  process.exit(1);
}
Promise.resolve(fn(...args)).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

