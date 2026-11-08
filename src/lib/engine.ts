import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type FactoryDb } from "./database";
import { safeStorageKey } from "./security";
import { readObject } from "./storage";
import { type Run } from "./store";
const manifest = z.object({
  id: z.string(),
  state: z.enum(["queued", "running", "succeeded", "failed"]),
  stage: z.string(),
  updatedAt: z.iso.datetime(),
  artifacts: z
    .array(
      z.object({
        path: z.string(),
        key: z.string(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      }),
    )
    .max(200)
    .default([]),
});
export async function reconcileEngine(db: FactoryDb) {
  const prefix = process.env.VIDEO_STORAGE_PREFIX ?? "personal-video/v1";
  const runs = await db.query<Run>(
    sql`SELECT * FROM marketing_factory.task_runs WHERE engine_run_id IS NOT NULL AND status IN ('started','running') ORDER BY started_at LIMIT 50`,
  );
  for (const run of runs) {
    try {
      const engineId = run.engine_run_id!;
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(engineId)) continue;
      const status = manifest.parse(
        JSON.parse(
          Buffer.from(
            await readObject(`${prefix}/runs/${engineId}/status.json`),
          ).toString("utf8"),
        ),
      );
      if (status.id !== engineId) throw new Error("Engine identity mismatch.");
      if (
        run.engine_updated_at &&
        new Date(status.updatedAt).getTime() <=
          new Date(run.engine_updated_at).getTime()
      )
        continue;
      for (const file of status.artifacts) {
        if (
          !safeStorageKey(file.key, prefix, engineId) ||
          file.key !== `${prefix}/runs/${engineId}/results/${file.path}`
        )
          throw new Error("Invalid engine artifact namespace.");
      }
      // A terminal success must actually include an exported master and QA evidence.
      if (
        status.state === "succeeded" &&
        (!status.artifacts.some((a) => a.path === "video.mp4") ||
          !status.artifacts.some((a) => a.path === "qa.json"))
      )
        throw new Error(
          "No final video and QA manifest. Attach a final render run, not an inspection run.",
        );
      if (status.state === "succeeded") {
        const qaFile = status.artifacts.find((a) => a.path === "qa.json")!;
        const raw = await readObject(qaFile.key);
        const { createHash } = await import("node:crypto");
        if (createHash("sha256").update(raw).digest("hex") !== qaFile.sha256)
          throw new Error("QA checksum mismatch.");
        const qa = JSON.parse(Buffer.from(raw).toString("utf8"));
        // Existing reports have different optional checks; never treat an explicit failure as passed.
        if (!hasMeasuredQa(qa))
          throw new Error("The engine QA report contains a failed check.");
      }
      await db.transaction(async (tx) => {
        const [t] = await tx.query<{ current_run_id: string }>(
          sql`SELECT current_run_id FROM marketing_factory.tasks WHERE id=${run.task_id} FOR UPDATE`,
        );
        if (t?.current_run_id !== run.id) return;
        const [fresh] = await tx.query<Run>(
          sql`SELECT * FROM marketing_factory.task_runs WHERE id=${run.id}`,
        );
        if (
          !fresh ||
          !["started", "running"].includes(fresh.status) ||
          (fresh.engine_updated_at &&
            new Date(status.updatedAt).getTime() <=
              new Date(fresh.engine_updated_at).getTime())
        )
          return;
        const sequence = new Date(status.updatedAt).getTime();
        await tx.query(
          sql`INSERT INTO marketing_factory.worker_events(event_id,task_id,run_id,producer_id,sequence,event_type,step_id,message,occurred_at) VALUES(${randomUUID()},${run.task_id},${run.id},'railway-engine',${sequence},${status.state === "succeeded" ? "run.completed" : status.state === "failed" ? "run.failed" : "step.started"},${status.stage},${"Railway: " + status.stage},${status.updatedAt}) ON CONFLICT DO NOTHING`,
        );
        const runStatus =
          status.state === "succeeded"
            ? "succeeded"
            : status.state === "failed"
              ? "failed"
              : "running";
        await tx.query(
          sql`UPDATE marketing_factory.task_runs SET status=${runStatus},adapter_error=NULL,engine_updated_at=${status.updatedAt},heartbeat_at=${status.updatedAt},finished_at=${["succeeded", "failed"].includes(status.state) ? new Date(status.updatedAt) : null} WHERE id=${run.id}`,
        );
        await tx.query(
          sql`UPDATE marketing_factory.tasks SET status=${status.state === "succeeded" ? "waiting_review" : status.state === "failed" ? "failed" : status.state === "queued" ? "queued" : "running"},updated_at=${status.updatedAt} WHERE id=${run.task_id}`,
        );
        if (status.state === "succeeded")
          for (const file of status.artifacts) {
            const type =
              file.path === "video.mp4"
                ? "video"
                : file.path === "qa.json"
                  ? "qa"
                  : file.path.endsWith(".srt")
                    ? "captions"
                    : "supporting_file";
            const [artifact] = await tx.query<{ id: string }>(
              sql`INSERT INTO marketing_factory.artifacts(id,task_id,run_id,title,type,sha256,bytes,storage_key,review_status) VALUES(${randomUUID()},${run.task_id},${run.id},${file.path},${type},${file.sha256},${file.bytes},${file.key},${type === "video" ? "needs_review" : "not_required"}) ON CONFLICT(task_id,sha256,type,run_id) DO UPDATE SET storage_key=excluded.storage_key RETURNING id`,
            );
            await tx.query(
              sql`INSERT INTO marketing_factory.delivery_jobs(id,artifact_id) VALUES(${randomUUID()},${artifact.id}) ON CONFLICT(artifact_id) DO NOTHING`,
            );
          }
      });
    } catch {
      await db
        .query(
          sql`UPDATE marketing_factory.task_runs SET adapter_error='Cannot verify remote state. Check the final render ID, bucket access and QA evidence.' WHERE id=${run.id}`,
        )
        .catch(() => {});
      console.error("Engine reconciliation needs attention", {
        run_id: run.id,
      });
    }
  }
}
export function hasMeasuredQa(value: unknown): boolean {
  return (
    z
      .object({
        fullDecode: z.literal("pass"),
        mediaContract: z.literal("pass"),
      })
      .passthrough()
      .safeParse(value).success && !hasQaFailure(value)
  );
}
export function hasQaFailure(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasQaFailure);
  for (const [key, item] of Object.entries(value)) {
    if (["passed", "ok", "success"].includes(key) && item === false)
      return true;
    if (key === "status" && ["failed", "fail", "error"].includes(String(item)))
      return true;
    if (hasQaFailure(item)) return true;
  }
  return false;
}
