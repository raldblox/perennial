/**
 * swap.ts - buy fUSD with QOR in the chain's native AMM, ready for the vault.
 *
 * One hybrid-signed (secp256k1 + ML-DSA-87) native transaction from the
 * account in .env, holding two messages:
 *   1. MsgSwapExactIn on pool 2 (fUSD/QOR): QOR in, fUSD out, with a minimum.
 *   2. MsgConvertCoin for that minimum: the swapped fUSD arrives as a bank coin
 *      (`erc20:0x9714…`), which contracts cannot see; converting it gives the
 *      same account an ERC-20 balance the vault can take.
 * Whatever the swap pays above the minimum stays a bank coin.
 *
 * Usage:  pnpm swap [qor]        default 1, at most 1
 */
import { StargateClient } from "@cosmjs/stargate";
import { amm, deriveUnifiedAccount, EthNativeSigner, getNetwork, qorechainRegistry } from "@qorechain/sdk";

const FUSD = "0x97143B771D34ddb9130b807b135Ae675A5a963CA";
const FUSD_DENOM = `erc20:${FUSD}`;
const POOL_ID = "2";
const MAX_QOR = 1;
const SLIPPAGE_BPS = 300n; // accept up to 3% less than the pool's quote
const FEE_BPS = 30n; // the pool keeps 0.30% of the input
const CONVERT_TYPE_URL = "/cosmos.evm.erc20.v1.MsgConvertCoin";

/** Protobuf writer for the one message the SDK has no codec for. */
class Writer {
  private bytes: number[] = [];
  private varint(n: number): void {
    while (n > 0x7f) {
      this.bytes.push((n & 0x7f) | 0x80);
      n >>>= 7;
    }
    this.bytes.push(n);
  }
  string(field: number, value: string): this {
    if (value === "") return this;
    const data = new TextEncoder().encode(value);
    this.varint((field << 3) | 2);
    this.varint(data.length);
    this.bytes.push(...data);
    return this;
  }
  message(field: number, data: Uint8Array): this {
    this.varint((field << 3) | 2);
    this.varint(data.length);
    this.bytes.push(...data);
    return this;
  }
  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

interface MsgConvertCoin {
  coin: { denom: string; amount: string };
  receiver: string;
  sender: string;
}

/** cosmos.evm.erc20.v1.MsgConvertCoin { Coin coin = 1; string receiver = 2; string sender = 3; } */
const MsgConvertCoinCodec = {
  encode(msg: MsgConvertCoin): Writer {
    const coin = new Writer().string(1, msg.coin.denom).string(2, msg.coin.amount).finish();
    return new Writer().message(1, coin).string(2, msg.receiver).string(3, msg.sender);
  },
  decode(): MsgConvertCoin {
    throw new Error("decode not needed");
  },
  fromPartial(msg: MsgConvertCoin): MsgConvertCoin {
    return msg;
  },
};

interface Pool {
  id: string;
  token_a: string;
  token_b: string;
  reserve_a: string;
  reserve_b: string;
  status: string;
}

function format(units: bigint, decimals: number): string {
  const s = units.toString().padStart(decimals + 1, "0");
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
}

async function main(): Promise<void> {
  const qor = Number(process.argv[2] ?? "1");
  if (!(qor > 0 && qor <= MAX_QOR)) throw new Error(`Swap between 0 and ${MAX_QOR} QOR`);
  const amountIn = BigInt(Math.round(qor * 1_000_000));
  const mnemonic = process.env.QORE_MNEMONIC?.trim();
  if (!mnemonic) throw new Error("Set QORE_MNEMONIC in .env");

  const net = getNetwork("testnet");
  const rest = process.env.QORE_REST_URL?.trim() || net.endpoints.rest;
  const rpc = process.env.QORE_RPC_URL?.trim() || net.endpoints.rpc;
  const account = await deriveUnifiedAccount(mnemonic, 0);

  const pools = (await (await fetch(`${rest}/qorechain/amm/v1/pools`)).json()) as { pools: Pool[] };
  const pool = pools.pools.find((p) => p.id === POOL_ID);
  if (!pool || pool.status !== "active" || pool.token_a !== FUSD_DENOM || pool.token_b !== "uqor") {
    throw new Error(`pool ${POOL_ID} is not the active fUSD/QOR pool`);
  }
  // Constant product: out = reserveOut * inAfterFee / (reserveIn + inAfterFee).
  const inAfterFee = (amountIn * (10_000n - FEE_BPS)) / 10_000n;
  const quote = (BigInt(pool.reserve_a) * inAfterFee) / (BigInt(pool.reserve_b) + inAfterFee);
  const minOut = (quote * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  if (minOut === 0n) throw new Error("the quote rounds to zero");
  console.log(`account ${account.evm} (${account.cosmos})`);
  console.log(`swap ${format(amountIn, 6)} QOR on pool ${POOL_ID}: quote ${format(quote, 6)} fUSD, minimum ${format(minOut, 6)}`);

  const registry = qorechainRegistry([[CONVERT_TYPE_URL, MsgConvertCoinCodec as never]]);
  const signer = new EthNativeSigner(account, { signMode: "hybrid", rest, registry });
  const res = await fetch(`${rest}/cosmos/auth/v1beta1/accounts/${account.cosmos}`);
  if (!res.ok) throw new Error(`account query failed: HTTP ${res.status}`);
  const body = (await res.json()) as { account?: Record<string, unknown> };
  const acc = (body.account?.base_account ?? body.account ?? {}) as Record<string, string>;

  const transport = await StargateClient.connect(rpc);
  try {
    const result = await signer.signAndBroadcast(transport, {
      chainId: net.chainId,
      accountNumber: BigInt(acc.account_number ?? "0"),
      sequence: BigInt(acc.sequence ?? "0"),
      fee: { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" },
      messages: [
        amm.swapExactIn({
          sender: account.cosmos,
          poolId: POOL_ID,
          tokenIn: { denom: "uqor", amount: amountIn.toString() },
          denomOut: FUSD_DENOM,
          minOut: minOut.toString(),
        }),
        {
          typeUrl: CONVERT_TYPE_URL,
          value: { coin: { denom: FUSD_DENOM, amount: minOut.toString() }, receiver: account.evm, sender: account.cosmos },
        },
      ],
    });
    if (result.code !== 0) throw new Error(`refused with code ${result.code}: ${result.rawLog ?? ""}`);
    console.log(`swapped: ${result.transactionHash}`);
  } finally {
    transport.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
