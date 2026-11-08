import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../src/lib/database";
import { claimDelivery, deliver } from "../src/lib/delivery";
import { reconcileEngine } from "../src/lib/engine";
async function main() {
  dotenv.config({ path: ".env.local", quiet: true });
  if (!process.env.DATABASE_URL)
    throw new Error(
      "The separate delivery worker requires DATABASE_URL. Local PGlite is owned by the web process.",
    );
  const db = await getDb();
  let running = true;
  const owner = randomUUID();
  process.on("SIGTERM", () => {
    running = false;
  });
  process.on("SIGINT", () => {
    running = false;
  });
  console.log(
    "Factory delivery/reconciliation worker started. No agent execution or rendering.",
  );
  const pause = () => new Promise((resolve) => setTimeout(resolve, 15000));
  async function observe() {
    while (running) {
      try {
        await db.query(
          sql`INSERT INTO marketing_factory.integrations(id,value_json) VALUES('delivery_worker',${JSON.stringify({ last_seen: new Date().toISOString() })}::jsonb) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,updated_at=now()`,
        );
        if (process.env.S3_BUCKET) await reconcileEngine(db);
      } catch {
        console.error(
          "Factory reconciliation failed; last confirmed state retained.",
        );
      }
      await pause();
    }
  }
  async function transfer() {
    while (running) {
      try {
        const job = await claimDelivery(db, owner);
        if (job) {
          await deliver(db, job);
          continue;
        }
      } catch {
        console.error(
          "Factory delivery cycle failed; saved transfer retained.",
        );
      }
      await pause();
    }
  }
  await Promise.all([observe(), transfer()]);
  await db.close();
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Factory command failed.",
  );
  process.exitCode = 1;
});
