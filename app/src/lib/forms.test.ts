import { describe, expect, it } from "vitest";
import { computeAgentSizing } from "../components/AgentCalculator";
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
      budgetMode: false,
    });
  });

  it("needs a claim amount for budget mode", () => {
    expect(validateTerms({ ...draft, payout: "", budgetMode: true }, { decimals: 6 }).errors).toEqual({ budget: true });
    expect(validateTerms({ ...draft, payout: "5", budgetMode: true }, { decimals: 6 }).terms?.budgetMode).toBe(true);
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

describe("computeAgentSizing", () => {
  it("sizes a deposit from calls an hour and a price", () => {
    // At Aave v3 USDC's 30-day mean, 4.29%.
    expect(computeAgentSizing({ mode: "deposit", calls: "1", deposit: "", price: "0.002", rate: "4.29", margin: "1.15" })).toEqual({
      deposit: 469_650_350n,
      callsPerHourX100: 100n,
      price: 2_000n,
      yearly: 17_520_000n,
      lastsDaysX100: null,
    });
  });

  it("inverts: 500 fUSD at 4.29% pays 1.06 calls an hour", () => {
    const result = computeAgentSizing({ mode: "calls", calls: "", deposit: "500", price: "0.002", rate: "4.29", margin: "1.15" });
    expect(result?.callsPerHourX100).toBe(106n);
  });

  it("at 0% says how long the deposit lasts instead", () => {
    // 500 fUSD at one 0.002 call an hour: 0.048 a day, 10,416.66 days.
    const result = computeAgentSizing({ mode: "deposit", calls: "1", deposit: "500", price: "0.002", rate: "0", margin: "1.15" });
    expect(result?.lastsDaysX100).toBe(1_041_666n);
  });

  it("refuses a margin under 1, a zero rate without a deposit, a zero price, and bad numbers", () => {
    const base = { mode: "deposit" as const, calls: "1", deposit: "", price: "0.002", rate: "4.29", margin: "1.15" };
    expect(computeAgentSizing({ ...base, margin: "0.9" })).toBeNull();
    expect(computeAgentSizing({ ...base, rate: "0" })).toBeNull(); // 0% needs a deposit to say how long it lasts
    expect(computeAgentSizing({ ...base, price: "0" })).toBeNull();
    expect(computeAgentSizing({ ...base, calls: "x" })).toBeNull();
  });
});

describe("routes", () => {
  it("parses and builds hash routes, with the vault", () => {
    expect(parseRoute("")).toEqual({ name: "overview" });
    expect(parseRoute("#/open")).toEqual({ name: "open", vault: "agent" });
    expect(parseRoute("#/open?vault=demo&calls=2")).toEqual({ name: "open", vault: "demo" });
    expect(parseRoute("#/positions")).toEqual({ name: "positions", vault: "agent" });
    expect(parseRoute("#/positions?vault=noyield&address=0xabc")).toEqual({ name: "positions", vault: "noyield", address: "0xabc" });
    expect(parseRoute("#/position/12")).toEqual({ name: "position", vault: "agent", id: 12n });
    expect(parseRoute("#/position/noyield/2")).toEqual({ name: "position", vault: "noyield", id: 2n });
    expect(parseRoute("#/position/v1/2")).toEqual({ name: "not-found" });
    expect(parseRoute("#/position/0")).toEqual({ name: "not-found" });
    expect(parseRoute("#/position/nowhere/2")).toEqual({ name: "not-found" });
    expect(parseRoute("#/open?vault=nowhere")).toEqual({ name: "not-found" });
    expect(parseRoute("#/nope")).toEqual({ name: "not-found" });
    expect(href({ name: "position", vault: "agent", id: 7n })).toBe("#/position/7");
    expect(href({ name: "position", vault: "demo", id: 7n })).toBe("#/position/demo/7");
    expect(href({ name: "open", vault: "demo" })).toBe("#/open?vault=demo");
  });
});
