import dotenv from "dotenv";
import { createDatabase } from "../src/lib/database";
async function main() {
  dotenv.config({ path: ".env.local", quiet: true });
  const db = await createDatabase({
    url: process.env.DATABASE_URL,
    directory: process.env.DATABASE_URL ? undefined : ".data/postgres",
    migrate: true,
  });
  console.log(`Factory schema migrated (${db.mode}).`);
  await db.close();
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Factory command failed.",
  );
  process.exitCode = 1;
});
