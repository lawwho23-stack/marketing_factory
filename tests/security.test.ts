import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  matchesToken,
  safeStorageKey,
} from "../src/lib/security";
describe("credential boundaries", () => {
  it("fails closed without configured bridge secrets", () => {
    expect(matchesToken("anything", undefined)).toBe(false);
    expect(matchesToken("correct", "correct")).toBe(true);
    expect(matchesToken("wrong", "correct")).toBe(false);
  });
  it("encrypts tokens at rest and detects tampering", () => {
    const key = "a".repeat(64);
    const encrypted = encryptSecret("private refresh token", key);
    expect(encrypted).not.toContain("private");
    expect(decryptSecret(encrypted, key)).toBe("private refresh token");
    expect(() => decryptSecret(encrypted, "b".repeat(64))).toThrow();
  });
  it("rejects cross-namespace and traversal object keys", () => {
    expect(
      safeStorageKey(
        "personal-video/v1/runs/run-1/results/video.mp4",
        "personal-video/v1",
        "run-1",
      ),
    ).toBe(true);
    expect(
      safeStorageKey(
        "personal-video/v1/runs/run-2/results/video.mp4",
        "personal-video/v1",
        "run-1",
      ),
    ).toBe(false);
    expect(
      safeStorageKey(
        "personal-video/v1/runs/run-1/results/../secret",
        "personal-video/v1",
        "run-1",
      ),
    ).toBe(false);
  });
});
