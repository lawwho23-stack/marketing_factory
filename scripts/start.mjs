import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL)
  process.env.FACTORY_DATA_DIR = path.resolve(
    process.env.FACTORY_DATA_DIR ?? ".data/postgres",
  );
process.env.PORT ??= "3000";
process.env.HOSTNAME = "127.0.0.1";
await import("../.next/standalone/server.js");
