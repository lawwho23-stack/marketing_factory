import { hash } from "@node-rs/argon2";
import { mkdir, writeFile } from "node:fs/promises";
if (!process.stdin.isTTY) {
  console.error(
    "Run this command in an interactive terminal. Passwords are never accepted as shell arguments.",
  );
  process.exit(1);
}
function secret(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = "";
    const handler = (chunk) => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") {
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(1);
        } else if (char === "\r" || char === "\n") {
          process.stdin.off("data", handler);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          resolve(value);
          return;
        } else if (char === "\u007f") {
          value = value.slice(0, -1);
        } else if (char >= " ") {
          value += char;
        }
      }
    };
    process.stdin.on("data", handler);
  });
}
const first = await secret(
  "New owner password (minimum 12 characters, hidden): ",
);
if (first.length < 12) {
  console.error("Use at least 12 characters.");
  process.exit(1);
}
const second = await secret("Confirm password (hidden): ");
if (first !== second) {
  console.error("Passwords did not match.");
  process.exit(1);
}
await mkdir(".data", { recursive: true, mode: 0o700 });
await writeFile(
  ".data/owner-password-hash.txt",
  Buffer.from(await hash(first)).toString("base64") + "\n",
  { mode: 0o600 },
);
console.log(
  "Base64-encoded Argon2id hash saved to .data/owner-password-hash.txt. Set OWNER_PASSWORD_HASH to this value. No password printed or saved.",
);
