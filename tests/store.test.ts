import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, type FactoryDb } from "../src/lib/database";
import {
  createTask,
  registerRun,
  ingestEvent,
  importPackage,
  reviewArtifact,
  setManualStatus,
  attachEngine,
  listTasks,
} from "../src/lib/store";

let db: FactoryDb;
beforeAll(async () => {
  db = await createDatabase();
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("event ingestion", () => {
  it("does not let a local heartbeat certify a stale remote run", async () => {
    const { sql } = await import("drizzle-orm");
    const { getOverview } = await import("../src/lib/overview");
    const task = await createTask(db, {
      title: "Remote source authority",
      worker_id: "video_editor",
      description: "",
    });
    const run = await registerRun(db, task.id, "local-source");
    await attachEngine(db, run.id, "engine-authority-test");
    await db.query(
      sql`UPDATE marketing_factory.task_runs SET heartbeat_at=now()-interval '10 minutes',engine_updated_at=now()-interval '10 minutes' WHERE id=${run.id}`,
    );
    await ingestEvent(db, {
      event_id: randomUUID(),
      task_id: task.id,
      run_id: run.id,
      worker_id: "video_editor",
      producer_id: "local-source",
      sequence: 1,
      event_type: "worker.heartbeat",
      message: "Reporter is alive",
      occurred_at: new Date().toISOString(),
    });
    expect(
      (await getOverview(db)).workers.find((w) => w.id === "video_editor")
        ?.status,
    ).toBe("stale");
  });
  it("deduplicates delivery, rejects mismatched worker, and guards terminal status", async () => {
    const task = await createTask(db, {
      title: "Actual writer task",
      worker_id: "script_writer",
      description: "",
    });
    const run = await registerRun(db, task.id, "writer-test");
    const event = {
      event_id: randomUUID(),
      task_id: task.id,
      run_id: run.id,
      worker_id: "script_writer" as const,
      producer_id: "writer-test",
      sequence: 1,
      event_type: "run.started" as const,
      message: "Drafting",
      occurred_at: new Date().toISOString(),
    };
    expect(await ingestEvent(db, event)).toEqual({
      accepted: true,
      duplicate: false,
    });
    expect(await ingestEvent(db, event)).toEqual({
      accepted: true,
      duplicate: true,
    });
    await expect(
      ingestEvent(db, {
        ...event,
        event_id: randomUUID(),
        sequence: 2,
        worker_id: "video_editor",
      }),
    ).rejects.toThrow("worker");
    await ingestEvent(db, {
      ...event,
      event_id: randomUUID(),
      sequence: 3,
      event_type: "run.completed",
    });
    await ingestEvent(db, { ...event, event_id: randomUUID(), sequence: 2 });
    expect((await listTasks(db)).find((t) => t.id === task.id)?.status).toBe(
      "waiting_review",
    );
  });
  it("does not let an old run replace the current attempt", async () => {
    const task = await createTask(db, {
      title: "Retry writer task",
      worker_id: "script_writer",
      description: "",
    });
    const old = await registerRun(db, task.id, "old");
    await expect(registerRun(db, task.id, "new")).rejects.toThrow("active");
    await ingestEvent(db, {
      event_id: randomUUID(),
      task_id: task.id,
      run_id: old.id,
      worker_id: "script_writer",
      producer_id: "old",
      sequence: 1,
      event_type: "run.failed",
      message: "",
      occurred_at: new Date().toISOString(),
    });
    const newer = await registerRun(db, task.id, "new");
    expect(newer.id).not.toBe(old.id);
    await ingestEvent(db, {
      event_id: randomUUID(),
      task_id: task.id,
      run_id: old.id,
      worker_id: "script_writer",
      producer_id: "old",
      sequence: 2,
      event_type: "run.completed",
      message: "",
      occurred_at: new Date().toISOString(),
    });
    expect((await listTasks(db)).find((t) => t.id === task.id)?.status).toBe(
      "running",
    );
  });
});
describe("revision-specific approvals", () => {
  it("does not manually complete a video task before a verified output exists", async () => {
    const task = await createTask(db, {
      title: "No rendered artifact",
      worker_id: "video_editor",
      description: "",
    });
    await expect(setManualStatus(db, task.id, "completed")).rejects.toThrow(
      "output",
    );
  });
  const audience = "Myanmar study-abroad agency owners";
  const input = {
    schema_version: 1 as const,
    campaign_name: "Agency operations",
    target_audience: audience,
    week: "Week 1",
    overview: "",
    research: "",
    review_notes: "",
    scripts: [
      {
        script_id: "day-01",
        day: 1,
        category: "educational" as const,
        title: "Follow up with leads",
        target_audience: audience,
        language: "my" as const,
        estimated_duration_seconds: 45,
        hook_options: ["a", "b", "c"],
        selected_hook: "a",
        body_sections: [
          {
            type: "insight",
            voiceover: "A real first draft",
            visual_direction: "",
          },
        ],
        cta: "",
        overlay_text: [],
        editor_notes: "",
        claim_sources: [],
      },
    ],
  };
  it("persists readable drafts, approves exact hashes, and requires review after edits", async () => {
    const task = await createTask(db, {
      title: "Review package",
      worker_id: "script_writer",
      description: "",
    });
    const first = await importPackage(db, task.id, input);
    await reviewArtifact(db, first.id, first.sha256, "approved", "");
    const second = await importPackage(db, task.id, {
      ...input,
      overview: "Revised package",
    });
    expect(second.review_status).toBe("needs_review");
    await expect(
      reviewArtifact(db, first.id, first.sha256, "approved", ""),
    ).rejects.toThrow("latest");
    expect((await listTasks(db)).find((t) => t.id === task.id)?.status).toBe(
      "waiting_review",
    );
  });
  it("does not approve an old output as the result of a newer run", async () => {
    const task = await createTask(db, {
      title: "New attempt needs its own output",
      worker_id: "script_writer",
      description: "",
    });
    const old = await registerRun(db, task.id, "old-output");
    const artifact = await importPackage(db, task.id, input);
    await ingestEvent(db, {
      event_id: randomUUID(),
      task_id: task.id,
      run_id: old.id,
      worker_id: "script_writer",
      producer_id: "old-output",
      sequence: 1,
      event_type: "run.completed",
      message: "Old draft",
      occurred_at: new Date().toISOString(),
    });
    await registerRun(db, task.id, "new-output");
    await expect(
      reviewArtifact(db, artifact.id, artifact.sha256, "approved", ""),
    ).rejects.toThrow("current run");
  });
  it("rejects stale producer package imports after a replacement run starts", async () => {
    const task = await createTask(db, {
      title: "Old producer cannot upload into replacement",
      worker_id: "script_writer",
      description: "",
    });
    const old = await registerRun(db, task.id, "stale-producer");
    await ingestEvent(db, {
      event_id: randomUUID(),
      task_id: task.id,
      run_id: old.id,
      worker_id: "script_writer",
      producer_id: "stale-producer",
      sequence: 1,
      event_type: "run.failed",
      message: "Interrupted attempt",
      occurred_at: new Date().toISOString(),
    });
    const replacement = await registerRun(db, task.id, "replacement-producer");
    await expect(
      importPackage(db, task.id, input, {
        run_id: old.id,
        producer_id: "stale-producer",
      }),
    ).rejects.toThrow("current run");
    const accepted = await importPackage(db, task.id, input, {
      run_id: replacement.id,
      producer_id: "replacement-producer",
    });
    expect(accepted.run_id).toBe(replacement.id);
  });
  it("does not let QA sidecar approval complete a video task", async () => {
    const task = await createTask(db, {
      title: "Pending video delivery",
      worker_id: "video_editor",
      description: "",
    });
    const id = randomUUID();
    const { sql } = await import("drizzle-orm");
    await db.query(
      sql`INSERT INTO marketing_factory.artifacts(id,task_id,title,type,sha256) VALUES(${id},${task.id},'qa.json','qa',${"f".repeat(64)})`,
    );
    await expect(
      reviewArtifact(db, id, "f".repeat(64), "approved", ""),
    ).rejects.toThrow("reviewable");
  });
  it("preserves an already approved package when its generation completion arrives late", async () => {
    const task = await createTask(db, {
      title: "Late generation completion",
      worker_id: "script_writer",
      description: "",
    });
    const run = await registerRun(db, task.id, "writer-late");
    const artifact = await importPackage(db, task.id, input);
    await reviewArtifact(db, artifact.id, artifact.sha256, "approved", "");
    await ingestEvent(db, {
      event_id: randomUUID(),
      task_id: task.id,
      run_id: run.id,
      worker_id: "script_writer",
      producer_id: "writer-late",
      sequence: 1,
      event_type: "run.completed",
      message: "Export completed",
      occurred_at: new Date().toISOString(),
    });
    expect((await listTasks(db)).find((t) => t.id === task.id)?.status).toBe(
      "completed",
    );
  });
});
