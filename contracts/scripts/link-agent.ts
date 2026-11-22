/**
 * link-agent.ts - link an agent's ed25519 key to the beneficiary account with
 * chain-enforced spending limits (decision 009).
 *
 * The vault already limits what leaves a position (budget mode: payoutAmount
 * per payoutInterval). This adds a second, independent limit enforced by the
 * chain on the beneficiary's own account: the agent's key may only transfer
 * fUSD, at most a set amount per call and per UTC day, until the link expires. A relayer submits the agent's calls, so the agent
 * needs no QOR and no EVM window.
 *
 *   pnpm link-agent --account qor1... [--per-call 0.01] [--daily 1] [--days 30]
 *       Dry run: builds the two messages with an ephemeral agent key, checks
 *       the possession proof and the rule as the chain will, prints them.
 *       Sends nothing and needs no secret.
 *   pnpm link-agent --broadcast
 *       Links AGENT_ED25519_KEY (hex seed, from .env) to the QORE_MNEMONIC
 *       account in one hybrid transaction signed by that account.
 */
import { StargateClient } from "@cosmjs/stargate";
import {
  deriveUnifiedAccount,
  EthNativeSigner,
  getNetwork,
  linkAuthenticatorMsgs,
  ruleBoundsEveryDenom,
  signAuthenticatorLinkEd25519,
  type SpendingRuleInput,
} from "@qorechain/sdk";
import { ed25519 } from "@noble/curves/ed25519.js";
import { getAddress, parseUnits } from "viem";

const FUSD = "0x97143B771D34ddb9130b807b135Ae675A5a963CA";
/** ERC-20 transfer(address,uint256): the only call the agent's key may make. */
const TRANSFER = "0xa9059cbb";
const MAX_DAYS = 30;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));
}

/** The one rule the account keeps: fUSD transfers only, capped per call and per day. */
export function agentRule(perCall: bigint, daily: bigint): SpendingRuleInput {
  const denom = `erc20/${getAddress(FUSD)}`;
  return {
    id: "perennial-agent",
    enabled: true,
    allowedDenoms: [denom],
    denomLimits: [{ denom, perTxLimit: perCall.toString(), dailyLimit: daily.toString() }],
    allowedEvmCalls: [`${getAddress(FUSD)}/${TRANSFER}`],
  } as SpendingRuleInput;
}

async function main(): Promise<void> {
  const net = getNetwork("testnet");
  const perCall = parseUnits(arg("per-call") ?? "0.01", 6);
  const daily = parseUnits(arg("daily") ?? "1", 6);
  const days = Number(arg("days") ?? MAX_DAYS);
  if (!(days > 0 && days <= MAX_DAYS)) throw new Error(`--days must be 1 to ${MAX_DAYS}`);
  const broadcast = process.argv.includes("--broadcast");

  const acc = broadcast ? await deriveUnifiedAccount(requireEnv("QORE_MNEMONIC"), 0) : undefined;
  const account = acc?.cosmos ?? arg("account");
  if (!account) throw new Error("--account qor1... is required for a dry run");

  const seed = broadcast ? hexToBytes(requireEnv("AGENT_ED25519_KEY")) : ed25519.utils.randomSecretKey();
  const proof = signAuthenticatorLinkEd25519({ chainId: net.chainId, account, privateKey: seed });
  const rule = agentRule(perCall, daily);
  if (!ruleBoundsEveryDenom(rule as never)) throw new Error("the rule does not bound every denom it allows");

  const expiryUnix = Math.floor(Date.now() / 1000) + days * 86_400;
  const messages = linkAuthenticatorMsgs({
    owner: account,
    chainId: net.chainId,
    scheme: "ed25519",
    pubkey: proof.pubkey,
    permissions: ["evm"],
    expiryUnix,
    label: "perennial agent",
    possessionProof: proof.possessionProof,
    spendingRule: rule,
  });

  console.log(`chain:    ${net.chainId}`);
  console.log(`account:  ${account}`);
  console.log(`agent:    ed25519 ${Buffer.from(proof.pubkey).toString("hex")}${broadcast ? "" : " (ephemeral, dry run)"}`);
  console.log(`rule:     fUSD only; at most ${arg("per-call") ?? "0.01"} per call and ${arg("daily") ?? "1"} per UTC day`);
  console.log(`calls:    ${(rule.allowedEvmCalls ?? []).join(", ")}`);
  console.log(`expires:  ${new Date(expiryUnix * 1000).toISOString()}`);
  console.log(`messages: ${messages.map((m) => m.typeUrl).join(", ")}`);
  if (!broadcast || !acc) {
    console.log("Dry run: possession proof and rule checked, nothing sent.");
    return;
  }

  const rest = process.env.QORE_REST_URL?.trim() || net.endpoints.rest;
  const res = await fetch(`${rest}/cosmos/auth/v1beta1/accounts/${account}`);
  if (!res.ok) throw new Error(`account query failed: HTTP ${res.status.toString()}`);
  const body = (await res.json()) as { account?: Record<string, unknown> };
  const base = (body.account?.base_account ?? body.account ?? {}) as Record<string, string>;
  const signer = new EthNativeSigner(acc, { signMode: "hybrid", rest });
  const transport = await StargateClient.connect(process.env.QORE_RPC_URL?.trim() || net.endpoints.rpc);
  try {
    const sent = await signer.signAndBroadcast(transport, {
      chainId: net.chainId,
      accountNumber: BigInt(base.account_number ?? "0"),
      sequence: BigInt(base.sequence ?? "0"),
      fee: { amount: [{ denom: "uqor", amount: "60000" }], gas: "600000" },
      messages,
    });
    console.log(`linked:   ${sent.transactionHash}`);
  } finally {
    transport.disconnect();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
