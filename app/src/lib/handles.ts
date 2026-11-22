/**
 * QoreX @handles as beneficiaries and heirs, through @qorechain/handles.
 *
 * A resolution is accepted only when the registry's ed25519 attestation and
 * the owner's secp256k1 claim both verify; the package never returns anything
 * else. The address the vault receives is the record's EVM address when the
 * owner signed one (a unified account), otherwise the 20 bytes of the signed
 * Native qor1 address, which is how QoreChain's EVM sees that account.
 *
 * First-seen addresses are pinned in this browser. A handle whose address
 * differs from its pin is reported as changed and must be confirmed; the pin
 * is never updated silently.
 */
import { addressForNetwork, HandleClient, isHandleInput, normalizeHandle, type HandleRecord, type PinCheck, type PinnedHandle, type PinStore } from "@qorechain/handles";
import { getAddress, type Address } from "viem";

export { isHandleInput };

export interface HandlesConfig {
  baseUrl: string;
  registryPubkeyHex: string;
}

export interface ResolvedRecipient {
  handle: string;
  address: Address;
  qorAddress: string;
  /** "evm": the owner signed this EVM address. "native": derived from the signed qor1 address. */
  source: "evm" | "native";
  pin: PinCheck;
  record: HandleRecord;
}

const PIN_KEY = "perennial.handle-pins";

function readPins(): Record<string, PinnedHandle> {
  try {
    return JSON.parse(globalThis.localStorage.getItem(PIN_KEY) ?? "{}") as Record<string, PinnedHandle>;
  } catch {
    return {};
  }
}

/** Pins kept in this browser only, which is where the package says they belong. */
export const browserPins: PinStore = {
  get: (handle) => Promise.resolve(readPins()[normalizeHandle(handle)]),
  put: (pin) => {
    try {
      globalThis.localStorage.setItem(PIN_KEY, JSON.stringify({ ...readPins(), [pin.handle]: pin }));
    } catch {
      // Storage unavailable: the next resolution reports the handle as new again.
    }
    return Promise.resolve();
  },
};

/** The QoreChain testnet's EVM, as the package names networks. */
const EVM_NETWORK = "eip155:9800";

export async function resolveRecipient(
  input: string,
  config: HandlesConfig,
  options: { pins?: PinStore; fetchImpl?: typeof fetch; qorToEvm?: (qor: string) => string } = {},
): Promise<ResolvedRecipient> {
  const client = new HandleClient({ ...config, fetchImpl: options.fetchImpl });
  const { record, pin } = await client.resolve(input, options.pins ?? browserPins);
  const signedEvm = addressForNetwork(record, EVM_NETWORK);
  const toEvm = options.qorToEvm ?? (await import("@qorechain/sdk")).qorToEvm;
  return {
    handle: record.handle,
    address: getAddress(signedEvm ?? toEvm(record.qorAddress)),
    qorAddress: record.qorAddress,
    source: signedEvm ? "evm" : "native",
    pin,
    record,
  };
}

/** Records the address the user saw and accepted for a handle. */
export function pinRecipient(resolved: ResolvedRecipient, pins: PinStore = browserPins): Promise<void> {
  return pins.put({ handle: resolved.record.handle, qorAddress: resolved.qorAddress, pinnedAt: Date.now() });
}
