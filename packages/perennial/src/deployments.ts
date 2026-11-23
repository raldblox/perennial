/** Perennial on the QoreChain testnet (`qorechain-diana`, EVM chain id 9800). Every rate is simulated. */
import type { Address } from "viem";

export const QORECHAIN_TESTNET_CHAIN_ID = 9800;

export const testnet = {
  chainId: QORECHAIN_TESTNET_CHAIN_ID,
  /** fUSD, the asset every vault holds. */
  asset: "0x97143B771D34ddb9130b807b135Ae675A5a963CA" as Address,
  vaults: {
    /** Its source pays nothing: budget mode as QoreChain allows today. */
    noYield: "0x76DAC5461fF361f911e5F39810c9455a6180C180" as Address,
    /** Its source pays 4.29% a year, the Aave v3 USDC 30-day mean of 16 November 2026, from a test reserve. */
    simulated: "0x78075C631D41AF72c69e34120d5C33cDC7A66A71" as Address,
    /** Its source pays 15,768% a year, for demonstrations; never a return. */
    demo: "0x496AAa4D585B97c8a26095D97Af4bBfAd473798c" as Address,
  },
  /** QoreChain's post-quantum precompiles the vault calls. */
  precompiles: {
    pqcVerify: "0x0000000000000000000000000000000000000a01" as Address,
    pqcKeyStatus: "0x0000000000000000000000000000000000000a02" as Address,
  },
} as const;
