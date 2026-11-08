import { describe, expect, it } from "vitest";
import {
  projectEvent,
  validateMoney,
  validateScriptPackage,
  transactionSchema,
} from "../src/lib/domain";

describe("truthful task state", () => {
  it("never regresses a completed run on a delayed event", () => {
    expect(
      projectEvent(
        { status: "succeeded", sequence: 4 },
        { status: "running", sequence: 2 },
      ),
    ).toEqual({ status: "succeeded", sequence: 4 });
  });
  it("ignores replayed and out-of-order source events", () => {
    expect(
      projectEvent(
        { status: "running", sequence: 3 },
        { status: "failed", sequence: 2 },
      ),
    ).toEqual({ status: "running", sequence: 3 });
  });
  it("advances a genuinely newer event", () => {
    expect(
      projectEvent(
        { status: "running", sequence: 3 },
        { status: "succeeded", sequence: 4 },
      ),
    ).toEqual({ status: "succeeded", sequence: 4 });
  });
});

describe("manual finance", () => {
  it("returns validation feedback for invalid transaction amounts", () => {
    expect(
      transactionSchema.safeParse({
        type: "expense",
        amount: "-1",
        currency: "THB",
        category: "Hosting",
        transaction_date: "2026-11-08",
      }).success,
    ).toBe(false);
  });
  it("accepts exact positive decimal strings and normalizes currency", () => {
    expect(validateMoney("1200.50", "mmk")).toEqual({
      amount: "1200.50",
      currency: "MMK",
    });
  });
  it.each(["-1", "0", "1.999", "1e8", "NaN", "10000000000000000.00"])(
    "rejects invalid amount %s",
    (amount) => {
      expect(() => validateMoney(amount, "THB")).toThrow();
    },
  );
});

describe("script handoff", () => {
  it("rejects incomplete packages and mixed target audiences", () => {
    expect(() => validateScriptPackage({ scripts: [] })).toThrow();
  });
});
