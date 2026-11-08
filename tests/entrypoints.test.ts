import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
const root = process.cwd();
describe("production TypeScript entrypoints", () => {
  it("starts the worker far enough to show its intentional missing-database guard", () => {
    const temporary = mkdtempSync(
      path.join(os.tmpdir(), "marketing-factory-entry-"),
    );
    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          path.join(root, "scripts/worker.ts"),
        ],
        {
          cwd: temporary,
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: "" },
          timeout: 20000,
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "separate delivery worker requires DATABASE_URL",
      );
      expect(result.stderr).not.toContain("Top-level await");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
  it("runs the migration command against a separate temporary local database", () => {
    const temporary = mkdtempSync(
      path.join(os.tmpdir(), "marketing-factory-migrate-"),
    );
    try {
      mkdirSync(path.join(temporary, "migrations"));
      copyFileSync(
        "migrations/0001_factory.sql",
        path.join(temporary, "migrations/0001_factory.sql"),
      );
      const result = spawnSync(
        process.execPath,
        [
          path.join(root, "node_modules/tsx/dist/cli.mjs"),
          path.join(root, "scripts/migrate.ts"),
        ],
        {
          cwd: temporary,
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: "" },
          timeout: 20000,
        },
      );
      expect(result.stderr).not.toContain("Top-level await");
      expect(result.status).toBe(0);
      expect(existsSync(path.join(temporary, ".data/postgres"))).toBe(true);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
