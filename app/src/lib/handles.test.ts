import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, recordSignBytes, signClaim, type HandleRecord, type PinnedHandle, type PinStore } from "@qorechain/handles";
import { bytesToBech32, qorToEvm, ripemd160, sha256 } from "@qorechain/sdk";
import { describe, expect, it } from "vitest";
import { isHandleInput, pinRecipient, resolveRecipient } from "./handles";

// A registry and an owner of our own: the real registry's key is not published.
const registrySecret = ed25519.utils.randomSecretKey();
const registryPubkeyHex = bytesToHex(ed25519.getPublicKey(registrySecret));
const ownerSecret = secp256k1.utils.randomSecretKey();
const qorAddress = bytesToBech32(ripemd160(sha256(secp256k1.getPublicKey(ownerSecret, true))), "qor");
const config = { baseUrl: "https://registry.test", registryPubkeyHex };

function record(overrides: Partial<HandleRecord> = {}): HandleRecord {
  const claim = signClaim("alice", qorAddress, ownerSecret);
  const unsigned = { handle: "alice", qorAddress, pqcRegistered: true, createdAt: 1_794_000_000, ...claim, ...overrides };
  return { ...unsigned, sigRegistryHex: bytesToHex(ed25519.sign(recordSignBytes(unsigned), registrySecret)) };
}

function registry(answer: HandleRecord | null): typeof fetch {
  return (() => Promise.resolve(answer ? new Response(JSON.stringify({ record: answer })) : new Response("", { status: 404 })));
}

function memoryPins(): PinStore & { all: Map<string, PinnedHandle> } {
  const all = new Map<string, PinnedHandle>();
  return { all, get: (h) => Promise.resolve(all.get(h)), put: (p) => Promise.resolve(void all.set(p.handle, p)) };
}

describe("QoreX @handles", () => {
  it("tells a handle from an address", () => {
    expect(isHandleInput("@alice")).toBe(true);
    expect(isHandleInput("0x9858EfFD232B4033E47d90003D41EC34EcaEda94")).toBe(false);
    expect(isHandleInput(qorAddress)).toBe(false);
  });

  it("resolves a verified handle to the 20 bytes of its signed qor1 address", async () => {
    const r = await resolveRecipient("@Alice", config, { fetchImpl: registry(record()), pins: memoryPins(), qorToEvm });
    expect(r.handle).toBe("alice");
    expect(r.qorAddress).toBe(qorAddress);
    expect(r.address.toLowerCase()).toBe(qorToEvm(qorAddress).toLowerCase());
    expect(r.source).toBe("native");
    expect(r.pin.status).toBe("new");
  });

  it("uses the EVM address the owner signed, when there is one", async () => {
    const evm = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";
    const r = await resolveRecipient("@alice", config, { fetchImpl: registry(record({ evmAddress: evm })), pins: memoryPins(), qorToEvm });
    expect(r.address).toBe(evm);
    expect(r.source).toBe("evm");
  });

  it("refuses a record the registry did not sign", async () => {
    const forged = { ...record(), qorAddress: bytesToBech32(new Uint8Array(20).fill(7), "qor") };
    await expect(resolveRecipient("@alice", config, { fetchImpl: registry(forged), pins: memoryPins(), qorToEvm })).rejects.toThrow(/failed verification/);
  });

  it("refuses a record signed by another registry key", async () => {
    const other = { ...config, registryPubkeyHex: bytesToHex(ed25519.getPublicKey(ed25519.utils.randomSecretKey())) };
    await expect(resolveRecipient("@alice", other, { fetchImpl: registry(record()), pins: memoryPins(), qorToEvm })).rejects.toThrow(/registry signature invalid/);
  });

  it("says when a handle is unknown", async () => {
    await expect(resolveRecipient("@nobody", config, { fetchImpl: registry(null), pins: memoryPins(), qorToEvm })).rejects.toThrow(/No QoreX user/);
  });

  it("pins only when asked, and flags a changed address against the pin", async () => {
    const pins = memoryPins();
    const first = await resolveRecipient("@alice", config, { fetchImpl: registry(record()), pins, qorToEvm });
    expect(pins.all.size).toBe(0);
    await pinRecipient(first, pins);
    const again = await resolveRecipient("@alice", config, { fetchImpl: registry(record()), pins, qorToEvm });
    expect(again.pin.status).toBe("match");

    pins.all.set("alice", { handle: "alice", qorAddress: bytesToBech32(new Uint8Array(20).fill(9), "qor"), pinnedAt: 1 });
    const changed = await resolveRecipient("@alice", config, { fetchImpl: registry(record()), pins, qorToEvm });
    expect(changed.pin.status).toBe("CHANGED");
  });
});
