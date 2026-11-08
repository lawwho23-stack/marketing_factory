import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { type SQL } from "drizzle-orm";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface DbSession {
  query<T extends object = Record<string, unknown>>(
    statement: SQL,
  ): Promise<T[]>;
}
export interface FactoryDb extends DbSession {
  transaction<T>(fn: (tx: DbSession) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  mode: "neon" | "local";
}
const dialect = new PgDialect();

export async function createDatabase(
  options: { url?: string; directory?: string; migrate?: boolean } = {},
): Promise<FactoryDb> {
  const migration = await readFile(
    path.join(process.cwd(), "migrations/0001_factory.sql"),
    "utf8",
  );
  if (options.url) {
    const pool = new Pool({
      connectionString: options.url,
      max: 4,
      connectionTimeoutMillis: 10000,
    });
    const query: DbSession["query"] = async (statement) => {
      const q = dialect.sqlToQuery(statement);
      return (await pool.query(q.sql, q.params)).rows;
    };
    if (options.migrate) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('marketing_factory_migration'))",
        );
        await client.query(migration);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    return {
      mode: "neon",
      query,
      async close() {
        await pool.end();
      },
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn({
            query: async (statement) => {
              const q = dialect.sqlToQuery(statement);
              return (await client.query(q.sql, q.params)).rows;
            },
          });
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
    };
  }
  if (options.directory)
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const local = new PGlite(options.directory);
  await local.exec(migration);
  const query: DbSession["query"] = async (statement) => {
    const q = dialect.sqlToQuery(statement);
    return (await local.query(q.sql, q.params)).rows as never;
  };
  return {
    mode: "local",
    query,
    close: () => local.close(),
    transaction: (fn) =>
      local.transaction((tx) =>
        fn({
          query: async (statement) => {
            const q = dialect.sqlToQuery(statement);
            return (await tx.query(q.sql, q.params)).rows as never;
          },
        }),
      ),
  };
}

const globalDb = globalThis as unknown as { factoryDb?: Promise<FactoryDb> };
export function getDb() {
  if (!globalDb.factoryDb) {
    if (
      process.env.NODE_ENV === "production" &&
      !process.env.DATABASE_URL &&
      process.env.FACTORY_LOCAL_DATABASE !== "1"
    )
      throw new Error("DATABASE_URL is required in production.");
    globalDb.factoryDb = createDatabase({
      url: process.env.DATABASE_URL,
      directory: process.env.DATABASE_URL
        ? undefined
        : path.resolve(
            /* turbopackIgnore: true */
            process.cwd(),
            process.env.FACTORY_DATA_DIR ?? ".data/postgres",
          ),
    });
  }
  return globalDb.factoryDb;
}
