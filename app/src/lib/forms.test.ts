import { describe, expect, it } from "vitest";
import { computeSizing } from "../components/Calculator";
import { parseRoute, href } from "../router";
import { validateTerms, type TermsDraft } from "./openForm";

const draft: TermsDraft = {
  amount: "110400",
  beneficiary: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
  payout: "400",
  interval: "monthly",
  checkInDays: "90",
  graceDays: "30",
  ownerCanClose: false,
};

describe("validateTerms", () => {
  it("turns a valid draft into contract parameters", () => {
    const { terms, errors } = validateTerms(draft, { decimals: 6, balance: 200_000_000_000n, beneficiaryKeyUsable: true });
    expect(errors).toEqual({});
    expect(terms).toEqual({
      amount: 110_400_000_000n,
      beneficiary: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
      payoutAmount: 400_000_000n,
      payoutInterval: 2_628_000n,
      checkInPeriod: 7_776_000n,
      gracePeriod: 2_592_000n,
      ownerCanClose: false,
    });
  });

  it("allows a zero payout and zero grace", () => {
    const { terms } = validateTerms({ ...draft, payout: "", graceDays: "0" }, { decimals: 6 });
    expect(terms?.payoutAmount).toBe(0n);
    expect(terms?.gracePeriod).toBe(0n);
  });

  it("reports each problem", () => {
    const { terms, errors } = validateTerms(
      { ...draft, amount: "0", beneficiary: "0x123", payout: "1.0000001", checkInDays: "0", graceDays: "-1", ownerCanClose: true },
      { decimals: 6, ownerKeyUsable: false },
    );
    expect(terms).toBeNull();
    expect(errors).toEqual({ amount: true, beneficiary: true, payout: true, days: true, graceDays: true, ownerKey: true });
  });

  it("checks balance and the beneficiary's key", () => {
    const { errors } = validateTerms(draft, { decimals: 6, balance: 1n, beneficiaryKeyUsable: false });
    expect(errors).toEqual({ balance: true, beneficiaryKey: true });
  });

  it("refuses the zero address as beneficiary", () => {
    const { errors } = validateTerms({ ...draft, beneficiary: "0x0000000000000000000000000000000000000000" }, { decimals: 6 });
    expect(errors.beneficiary).toBe(true);
  });
});

describe("computeSizing", () => {
  it("sizes a payout", () => {
    expect(computeSizing({ mode: "principal", amount: "400", interval: "monthly", rate: "5", margin: "1.15" })).toEqual({
      principal: 110_400_000_000n,
      payout: 400_000_000n,
      annual: 4_800_000_000n,
      breakEvenBps: 435n,
    });
  });

  it("inverts: principal to payout", () => {
    const result = computeSizing({ mode: "payout", amount: "110400", interval: "monthly", rate: "5", margin: "1.15" });
    expect(result?.payout).toBe(400_000_000n);
    expect(result?.annual).toBe(4_800_000_000n);
  });

  it("refuses a margin under 1, a zero rate and bad numbers", () => {
    expect(computeSizing({ mode: "principal", amount: "400", interval: "monthly", rate: "5", margin: "0.9" })).toBeNull();
    expect(computeSizing({ mode: "principal", amount: "400", interval: "monthly", rate: "0", margin: "1.15" })).toBeNull();
    expect(computeSizing({ mode: "principal", amount: "x", interval: "monthly", rate: "5", margin: "1.15" })).toBeNull();
  });
});

describe("routes", () => {
  it("parses and builds hash routes", () => {
    expect(parseRoute("")).toEqual({ name: "overview" });
    expect(parseRoute("#/open")).toEqual({ name: "open" });
    expect(parseRoute("#/positions")).toEqual({ name: "positions" });
    expect(parseRoute("#/positions?address=0xabc")).toEqual({ name: "positions", address: "0xabc" });
    expect(parseRoute("#/position/12")).toEqual({ name: "position", id: 12n });
    expect(parseRoute("#/position/0")).toEqual({ name: "not-found" });
    expect(parseRoute("#/position/abc")).toEqual({ name: "not-found" });
    expect(parseRoute("#/nope")).toEqual({ name: "not-found" });
    expect(href({ name: "position", id: 7n })).toBe("#/position/7");
  });
});
