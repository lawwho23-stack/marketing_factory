import { describe, it, expect } from "vitest";
import { hasQaFailure, hasMeasuredQa } from "../src/lib/engine";
describe("existing video QA report", () => {
  it("requires the real engine media contract and decode evidence", () => {
    expect(hasMeasuredQa({})).toBe(false);
    expect(hasMeasuredQa(null)).toBe(false);
    expect(hasMeasuredQa({ fullDecode: "fail", mediaContract: "pass" })).toBe(
      false,
    );
    expect(
      hasMeasuredQa({
        fullDecode: "pass",
        mediaContract: "pass",
        humanListening: { status: "unverified" },
      }),
    ).toBe(true);
  });
  it("preserves explicit layout failures without treating unverified listening as a pass", () => {
    expect(hasQaFailure({ layoutAudit: { status: "fail" } })).toBe(true);
    expect(
      hasQaFailure({
        mediaContract: "pass",
        fullDecode: "pass",
        humanListening: { status: "unverified" },
      }),
    ).toBe(false);
  });
});
