/**
 * Turns whatever a read or write throws into a sentence the user can act on:
 * a decoded contract error with its arguments, a refusal from the chain's EVM
 * window, or a transport failure.
 */
import { classifyEvmWindowRejection } from "@qorechain/evm";
import { BaseError, ContractFunctionRevertedError, decodeErrorResult, type Hex } from "viem";
import { errors, type ContractErrorName } from "../copy";
import { vaultAbi } from "./abi";

export interface ExplainedError {
  /** One sentence for the user. */
  message: string;
  /** The contract error's name and arguments, or the raw reason, for the curious. */
  detail?: string;
  kind: "contract" | "window" | "funds" | "rejected" | "network" | "unknown";
}

function isContractErrorName(name: string): name is ContractErrorName {
  return Object.hasOwn(errors.contract, name);
}

function stringifyArgs(args: readonly unknown[] | undefined): string {
  if (!args || args.length === 0) return "";
  return `(${args.map((a) => (typeof a === "bigint" ? a.toString() : String(a))).join(", ")})`;
}

function revertData(error: unknown): Hex | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const found = error.walk((e) => typeof (e as { data?: unknown }).data === "string");
  const data = (found as { data?: unknown } | null)?.data;
  return typeof data === "string" && data.startsWith("0x") ? (data as Hex) : undefined;
}

export function explainError(error: unknown): ExplainedError {
  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
      const name = reverted.data.errorName;
      const detail = `${name}${stringifyArgs(reverted.data.args)}`;
      if (isContractErrorName(name)) return { kind: "contract", message: errors.contract[name], detail };
      return { kind: "contract", message: errors.rejectedByChain, detail };
    }
    const data = revertData(error);
    if (data && data.length >= 10) {
      try {
        const decoded = decodeErrorResult({ abi: vaultAbi, data });
        const detail = `${decoded.errorName}${stringifyArgs(decoded.args)}`;
        if (isContractErrorName(decoded.errorName)) {
          return { kind: "contract", message: errors.contract[decoded.errorName], detail };
        }
      } catch {
        // Not one of ours; fall through.
      }
    }
  }

  const windowRejection = classifyEvmWindowRejection(error);
  if (windowRejection) return { kind: "window", message: errors.window[windowRejection], detail: shortMessage(error) };

  const text = shortMessage(error);
  if (/insufficient funds/i.test(text)) return { kind: "funds", message: errors.insufficientGas, detail: text };
  if (/user rejected|denied/i.test(text)) return { kind: "rejected", message: errors.generic, detail: text };
  if (/fetch|network|timed? ?out|HTTP request failed|Failed to fetch/i.test(text)) {
    return { kind: "network", message: errors.network, detail: text };
  }
  return { kind: "unknown", message: errors.generic, detail: text };
}

function shortMessage(error: unknown): string {
  if (error instanceof BaseError) return error.shortMessage || error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
