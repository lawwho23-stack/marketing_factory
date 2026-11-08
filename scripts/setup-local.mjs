import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(root, ".env.local");
if (
  await access(target).then(
    () => true,
    () => false,
  )
) {
  console.log("Local configuration already exists; left unchanged.");
  process.exit(0);
}
await mkdir(path.join(root, ".data"), { recursive: true, mode: 0o700 });
const password = randomBytes(18).toString("base64url");
await writeFile(
  target,
  [
    `APP_URL=http://localhost:3000`,
    `AUTH_SECRET=${randomBytes(48).toString("hex")}`,
    `OWNER_PASSWORD_HASH=${Buffer.from(await hash(password)).toString("base64")}`,
    `FACTORY_BRIDGE_TOKEN=${randomBytes(32).toString("hex")}`,
    `TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`,
    "FACTORY_LOCAL_DATABASE=1",
    "VIDEO_STORAGE_PREFIX=personal-video/v1",
    "",
  ].join("\n"),
  { mode: 0o600, flag: "wx" },
);
await writeFile(
  path.join(root, ".data/local-login.txt"),
  `Development owner password: ${password}\n\nLocal use only. Rotate before production. This file is ignored by Git.\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Local configuration created. Development password: .data/local-login.txt (private file). No secrets printed.",
);
