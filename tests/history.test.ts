import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDatabase, type FactoryDb } from "../src/lib/database";
import { createTask, registerRun, listTasks } from "../src/lib/store";
import { getOverview, getBusinessExport } from "../src/lib/overview";
let db: FactoryDb;
beforeAll(async () => {
  db = await createDatabase();
}, 30000);
afterAll(async () => db.close());
it("keeps long-running work visible and exports all records beyond dashboard limits", async () => {
  const active = await createTask(db, {
    title: "A real long running writer job",
    worker_id: "script_writer",
    description: "",
  });
  await registerRun(db, active.id, "history-producer");
  const rows = Array.from(
    { length: 210 },
    (_, i) =>
      sql`(${randomUUID()},'script_writer',${"Archive task " + i},'planned',${new Date(Date.now() + i * 1000)})`,
  );
  await db.query(
    sql`INSERT INTO marketing_factory.tasks(id,worker_id,title,status,updated_at) VALUES ${sql.join(rows, sql`,`)}`,
  );
  const snapshot = await getOverview(db);
  expect(snapshot.workers.find((w) => w.id === "script_writer")?.task?.id).toBe(
    active.id,
  );
  const archive = await getBusinessExport(db);
  expect(archive.tasks).toHaveLength(211);
  const page = await listTasks(db, { limit: 25, offset: 200 });
  expect(page).toHaveLength(11);
});
