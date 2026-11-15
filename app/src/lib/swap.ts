/**
 * Quoting a swap of QOR for fUSD in the chain's native AMM (a constant-product
 * pool that keeps 0.30% of the input), and the minimum the page accepts.
 */

export const POOL_FEE_BPS = 30n;
export const SLIPPAGE_BPS = 300n;
/** The page swaps at most 1 QOR (1,000,000 uqor) at a time. */
export const MAX_SWAP_UQOR = 1_000_000n;

export interface Pool {
  id: string;
  token_a: string;
  token_b: string;
  reserve_a: string;
  reserve_b: string;
  status: string;
}

export interface SwapQuote {
  amountIn: bigint;
  quote: bigint;
  minOut: bigint;
}

/** out = reserveOut × inAfterFee ÷ (reserveIn + inAfterFee), rounded down. */
export function quoteExactIn(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: bigint = POOL_FEE_BPS): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const inAfterFee = (amountIn * (10_000n - feeBps)) / 10_000n;
  return (reserveOut * inAfterFee) / (reserveIn + inAfterFee);
}

export function withSlippage(amount: bigint, slippageBps: bigint = SLIPPAGE_BPS): bigint {
  return (amount * (10_000n - slippageBps)) / 10_000n;
}

/** The fUSD/QOR pool, checked to be what the page expects before quoting. */
export function quoteFromPool(pool: Pool | undefined, fusdDenom: string, amountIn: bigint): SwapQuote {
  if (!pool || pool.status !== "active" || pool.token_a !== fusdDenom || pool.token_b !== "uqor") {
    throw new Error("the pool is not the active fUSD/QOR pool");
  }
  const quote = quoteExactIn(amountIn, BigInt(pool.reserve_b), BigInt(pool.reserve_a));
  return { amountIn, quote, minOut: withSlippage(quote) };
}
