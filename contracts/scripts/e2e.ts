/**
 * e2e.ts - drive a deployed PerennialVault on the QoreChain testnet with real
 * ML-DSA-87 signatures.
 *
 * The unit tests run against a stand-in for the chain's PQC precompiles. This
 * script is the check that the real ones accept what the vault sends them: it
 * opens a small position, proves life, claims and closes, and confirms that a
 * forged or replayed signature is refused.
 *
 * It needs the account in .env (QORE_MNEMONIC) to have a registered ML-DSA-87
 * key, a live EVM window with about ten transactions left, and some of the
 * vault's asset. The principal comes back at the end.
 *
 * Usage:  pnpm e2e <vault address>
 */
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, toHex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { mldsa } from "@qorechain/pqc";
import { deriveUnifiedAccount, getNetwork } from "@qorechain/sdk";

const PRINCIPAL = 300_000_000n; // 300 units of a 6-decimal asset
const PAYOUT_INTERVAL = 45n; // seconds
const SIGNED_TX_GAS = 900_000n;

const vaultAbi = parseAbi([
  "struct Heir { address account; uint16 bps; }",
  "struct OpenParams { uint256 amount; address beneficiary; uint256 payoutAmount; uint64 payoutInterval; uint64 checkInPeriod; uint64 gracePeriod; bool ownerCanClose; Heir[] heirs; }",
  "struct Position { address owner; address beneficiary; bool ownerCanClose; bool succeeded; bool closed; uint64 payoutInterval; uint64 checkInPeriod; uint64 gracePeriod; uint64 lastCheckIn; uint64 lastPayout; uint256 payoutAmount; uint256 principal; uint256 shares; uint256 buffer; uint256 nonce; }",
  "function ASSET() view returns (address)",
  "function positionCount() view returns (uint256)",
  "function position(uint256 positionId) view returns (Position)",
  "function actionMessage(uint256 positionId, uint8 action, uint256 nonce, uint256 deadline, bytes32 paramsHash) view returns (bytes)",
  "function open(OpenParams p) returns (uint256)",
  "function harvest(uint256 positionId) returns (uint256)",
  "function checkIn(uint256 positionId, uint256 deadline, bytes signature)",
  "function claim(uint256 positionId, uint256 deadline, bytes signature) returns (uint256)",
  "function closeByOwner(uint256 positionId, uint256 deadline, bytes signature)",
  "error PQCUnavailable(address precompile)",
  "error PQCKeyNotRegistered(address account)",
  "error PQCKeyUnsupported(address account)",
  "error PQCKeyNotProven(address account)",
  "error PQCSignatureInvalid(address account)",
  "error SignatureExpired(uint256 deadline)",
  "error PayoutNotDue(uint256 positionId, uint256 dueAt)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
]);

const Action = { CheckIn: 0, Claim: 1, SetHeirs: 2, Close: 3 } as const;
const NO_PARAMS = `0x${"00".repeat(32)}` as const;

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex.slice(2), "hex"));
}

async function main(): Promise<void> {
  const vault = process.argv[2] as `0x${string}` | undefined;
  if (!vault || !/^0x[0-9a-fA-F]{40}$/.test(vault)) throw new Error("Usage: pnpm e2e <vault address>");
  const mnemonic = process.env.QORE_MNEMONIC?.trim();
  if (!mnemonic) throw new Error("Set QORE_MNEMONIC in .env");

  const network = getNetwork("testnet");
  const chain = defineChain({
    id: 9800,
    name: "QoreChain Testnet",
    nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
    rpcUrls: { default: { http: [process.env.QORE_EVM_RPC_URL?.trim() || network.endpoints.evmRpc] } },
  });
  const account = mnemonicToAccount(mnemonic);
  const pqc = (await deriveUnifiedAccount(mnemonic, 0)).pqc;
  const reader = createPublicClient({ chain, transport: http() });
  const wallet = createWalletClient({ account, chain, transport: http() });
  const me = account.address;

  const send = async (label: string, request: Parameters<typeof wallet.writeContract>[0]) => {
    const hash = await wallet.writeContract(request);
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label}: transaction reverted (${hash})`);
    console.log(`  ${label}: ${hash} (gas ${receipt.gasUsed})`);
    return receipt;
  };
  const expectRefused = async (label: string, call: () => Promise<unknown>) => {
    try {
      await call();
    } catch (err) {
      const reason = err instanceof Error ? (err.message.match(/PQC\w+|SignatureExpired|PayoutNotDue/)?.[0] ?? "reverted") : "reverted";
      console.log(`  ${label}: refused (${reason})`);
      return;
    }
    throw new Error(`${label}: was accepted, but must be refused`);
  };
  const position = (id: bigint) => reader.readContract({ address: vault, abi: vaultAbi, functionName: "position", args: [id] });
  /** Signs an action at the position's current nonce with the account's ML-DSA-87 key. */
  const sign = async (id: bigint, action: number, deadline: bigint): Promise<`0x${string}`> => {
    const { nonce } = await position(id);
    const message = await reader.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "actionMessage",
      args: [id, action, nonce, deadline, NO_PARAMS],
    });
    return toHex(mldsa.sign(pqc.secretKey, fromHex(message)));
  };
  const deadline = async () => (await reader.getBlock()).timestamp + 600n;

  const asset = await reader.readContract({ address: vault, abi: vaultAbi, functionName: "ASSET" });
  const balanceBefore = await reader.readContract({ address: asset, abi: erc20Abi, functionName: "balanceOf", args: [me] });
  console.log(`account ${me}, vault ${vault}, asset balance ${balanceBefore}`);
  if (balanceBefore < PRINCIPAL) throw new Error(`need ${PRINCIPAL} of the asset, have ${balanceBefore}`);

  console.log("1. open a position");
  const allowance = await reader.readContract({ address: asset, abi: erc20Abi, functionName: "allowance", args: [me, vault] });
  if (allowance < PRINCIPAL) {
    await send("approve", { address: asset, abi: erc20Abi, functionName: "approve", args: [vault, PRINCIPAL], account, chain });
  }
  await send("open", {
    address: vault,
    abi: vaultAbi,
    functionName: "open",
    args: [
      {
        amount: PRINCIPAL,
        beneficiary: me,
        payoutAmount: 0n,
        payoutInterval: PAYOUT_INTERVAL,
        checkInPeriod: 86_400n,
        gracePeriod: 86_400n,
        ownerCanClose: true,
        heirs: [],
      },
    ],
    account,
    chain,
  });
  const id = await reader.readContract({ address: vault, abi: vaultAbi, functionName: "positionCount" });
  console.log(`  position ${id}`);

  console.log("2. proof of life");
  let until = await deadline();
  const forged = toHex(new Uint8Array(4627).fill(7));
  await expectRefused("forged signature", () =>
    reader.simulateContract({ address: vault, abi: vaultAbi, functionName: "checkIn", args: [id, until, forged], account }),
  );
  const checkInSignature = await sign(id, Action.CheckIn, until);
  await expectRefused("check-in signature used for a claim", () =>
    reader.simulateContract({ address: vault, abi: vaultAbi, functionName: "claim", args: [id, until, checkInSignature], account }),
  );
  await send("checkIn", {
    address: vault,
    abi: vaultAbi,
    functionName: "checkIn",
    args: [id, until, checkInSignature],
    account,
    chain,
    gas: SIGNED_TX_GAS,
  });
  await expectRefused("replayed signature", () =>
    reader.simulateContract({ address: vault, abi: vaultAbi, functionName: "checkIn", args: [id, until, checkInSignature], account }),
  );

  console.log("3. claim the yield");
  const dueAt = (await position(id)).lastPayout + PAYOUT_INTERVAL;
  for (;;) {
    const now = (await reader.getBlock()).timestamp;
    if (now >= dueAt + 2n) break;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  until = await deadline();
  await send("claim", {
    address: vault,
    abi: vaultAbi,
    functionName: "claim",
    args: [id, until, await sign(id, Action.Claim, until)],
    account,
    chain,
    gas: SIGNED_TX_GAS,
  });
  const afterClaim = await position(id);
  console.log(`  principal ${afterClaim.principal}, buffer ${afterClaim.buffer}`);
  if (afterClaim.principal !== PRINCIPAL) throw new Error("the claim touched the principal");

  console.log("4. close and take the principal back");
  until = await deadline();
  await send("closeByOwner", {
    address: vault,
    abi: vaultAbi,
    functionName: "closeByOwner",
    args: [id, until, await sign(id, Action.Close, until)],
    account,
    chain,
    gas: SIGNED_TX_GAS,
  });

  const balanceAfter = await reader.readContract({ address: asset, abi: erc20Abi, functionName: "balanceOf", args: [me] });
  console.log(`asset balance ${balanceAfter} (earned ${balanceAfter - balanceBefore})`);
  if (!(await position(id)).closed) throw new Error("the position is not closed");
  if (balanceAfter < balanceBefore) throw new Error("the account ended with less than it started with");
  console.log("ok");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
