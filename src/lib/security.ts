import {
  createHash,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
export function matchesToken(actual: string, expected: string | undefined) {
  if (!expected || expected.length < 1) return false;
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(expected).digest(),
  );
}
function secretKey(key: string) {
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as hex.");
  return Buffer.from(key, "hex");
}
export function encryptSecret(value: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(key), iv);
  return Buffer.concat([
    iv,
    cipher.update(value, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
export function decryptSecret(value: string, key: string) {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 28) throw new Error("Invalid encrypted secret.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretKey(key),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([
    decipher.update(bytes.subarray(12, -16)),
    decipher.final(),
  ]).toString("utf8");
}
export function safeStorageKey(key: string, prefix: string, runId: string) {
  return (
    key.startsWith(`${prefix}/runs/${runId}/results/`) &&
    !key.includes("\\") &&
    !key.split("/").some((s) => s === ".." || s === "." || s === "")
  );
}
