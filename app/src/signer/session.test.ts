import { mldsa } from "@qorechain/pqc";
import { hexToBytes } from "viem";
import { afterEach, describe, expect, it } from "vitest";
import { canSignFor, isUnlocked, isValidPhrase, lock, normalisePhrase, signAction, unlock } from "./session";

// The public BIP-39 test vector. It holds nothing and must never hold anything.
const PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

afterEach(() => lock());

describe("session", () => {
  it("validates and normalises phrases", () => {
    expect(normalisePhrase("  Abandon\nabandon   ABOUT ")).toBe("abandon abandon about");
    expect(isValidPhrase(PHRASE)).toBe(true);
    expect(isValidPhrase("abandon abandon")).toBe(false);
  });

  it("derives the EVM and Native accounts of a phrase", async () => {
    const account = await unlock(PHRASE.toUpperCase());
    expect(account.evm).toBe("0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
    expect(account.native).toMatch(/^qor1/);
    expect(account.nativeEvm).not.toBe(account.evm);
    expect(Object.keys(account.publicKeys)).toHaveLength(2);
    for (const key of Object.values(account.publicKeys)) expect(key).toHaveLength(2 + 2592 * 2);
  }, 30_000);

  it("signs only for its own accounts, with keys that verify", async () => {
    const account = await unlock(PHRASE);
    const message = "0x0102030405";
    for (const signer of [account.evm, account.nativeEvm]) {
      expect(canSignFor(signer)).toBe(true);
      const signature = signAction(signer, message);
      expect(signature).toHaveLength(2 + 4627 * 2);
      const publicKey = account.publicKeys[signer];
      if (!publicKey) throw new Error("missing key");
      expect(mldsa.verify(hexToBytes(publicKey), hexToBytes(message), hexToBytes(signature))).toBe(true);
    }
    expect(canSignFor("0x000000000000000000000000000000000000dEaD")).toBe(false);
    expect(() => signAction("0x000000000000000000000000000000000000dEaD", message)).toThrow();
  }, 30_000);

  it("forgets everything on lock", async () => {
    const account = await unlock(PHRASE);
    lock();
    expect(isUnlocked()).toBe(false);
    expect(canSignFor(account.evm)).toBe(false);
    expect(() => signAction(account.evm, "0x01")).toThrow(/locked/);
  }, 30_000);

  it("refuses an invalid phrase", async () => {
    await expect(unlock("not a phrase")).rejects.toThrow(/invalid/);
    expect(isUnlocked()).toBe(false);
  });
});
