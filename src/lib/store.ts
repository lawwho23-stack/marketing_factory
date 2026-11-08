import { randomUUID, createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { type DbSession, type FactoryDb } from "./database";
import {
  eventSchema,
  taskSchema,
  validateScriptPackage,
  terminalRuns,
  type FactoryEvent,
  type WorkerId,
} from "./domain";

export interface Task {
  id: string;
  title: string;
  description: string;
  worker_id: WorkerId;
  status: string;
  source: string;
  campaign_id: string | null;
  current_run_id: string | null;
  created_at: string;
  updated_at: string;
  run_status?: string;
  heartbeat_at?: string;
  engine_run_id?: string;
  origin?: string;
  engine_updated_at?: string;
}
export interface Run {
  id: string;
  task_id: string;
  status: string;
  producer_id: string;
  sequence: number;
  engine_run_id: string | null;
  origin: string;
  engine_updated_at: string | null;
}
export interface Artifact {
  id: string;
  task_id: string;
  run_id: string | null;
  title: string;
  type: string;
  sha256: string;
  bytes: number;
  storage_key: string | null;
  drive_url: string | null;
  drive_file_id: string | null;
  content_json: unknown;
  review_status: string;
  review_note: string | null;
  created_at: string;
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function createTask(
  db: DbSession,
  input: unknown,
  source = "manual",
) {
  const v = taskSchema.parse(input);
  const [task] = await db.query<Task>(
    sql`INSERT INTO marketing_factory.tasks(id,title,description,worker_id,campaign_id,source) VALUES(${randomUUID()},${v.title},${v.description},${v.worker_id},${v.campaign_id ?? null},${source}) RETURNING *`,
  );
  return task;
}
export function listTasks(
  db: DbSession,
  options: {
    limit?: number;
    offset?: number;
    search?: string;
    worker?: string;
    status?: string;
  } = {},
) {
  return db.query<Task>(
    sql`SELECT t.*,r.status AS run_status,r.heartbeat_at,r.engine_run_id,r.origin,r.engine_updated_at FROM marketing_factory.tasks t LEFT JOIN marketing_factory.task_runs r ON r.id=t.current_run_id WHERE (${options.worker ?? null}::text IS NULL OR t.worker_id=${options.worker ?? null}) AND (${options.status ?? null}::text IS NULL OR t.status=${options.status ?? null}) AND t.title ILIKE ${"%" + (options.search ?? "") + "%"} ORDER BY t.updated_at DESC,t.id DESC LIMIT ${options.limit ?? 200} OFFSET ${options.offset ?? 0}`,
  );
}
export async function registerRun(
  db: FactoryDb,
  taskId: string,
  producerId: string,
) {
  return db.transaction(async (tx) => {
    const [task] = await tx.query<Task>(
      sql`SELECT * FROM marketing_factory.tasks WHERE id=${taskId} FOR UPDATE`,
    );
    if (!task) throw new AppError("Task not found.", 404);
    if (!["script_writer", "video_editor"].includes(task.worker_id))
      throw new AppError("Manual departments do not run Codex jobs.");
    if (task.current_run_id) {
      const [active] = await tx.query<Run>(
        sql`SELECT * FROM marketing_factory.task_runs WHERE id=${task.current_run_id}`,
      );
      if (active && !terminalRuns.has(active.status))
        throw new AppError("This task already has an active run.", 409);
    }
    const [run] = await tx.query<Run>(
      sql`INSERT INTO marketing_factory.task_runs(id,task_id,producer_id) VALUES(${randomUUID()},${taskId},${producerId}) RETURNING *`,
    );
    await tx.query(
      sql`UPDATE marketing_factory.tasks SET current_run_id=${run.id},status='running',source='local_codex',updated_at=now() WHERE id=${taskId}`,
    );
    return { ...run, worker_id: task.worker_id };
  });
}

export async function ingestEvent(db: FactoryDb, input: FactoryEvent) {
  const e = eventSchema.parse(input);
  return db.transaction(async (tx) => {
    const [task] = await tx.query<Task>(
      sql`SELECT * FROM marketing_factory.tasks WHERE id=${e.task_id} FOR UPDATE`,
    );
    const [run] = await tx.query<Run>(
      sql`SELECT * FROM marketing_factory.task_runs WHERE id=${e.run_id} AND task_id=${e.task_id}`,
    );
    if (!task || !run) throw new AppError("Unknown task or run.", 404);
    if (task.worker_id !== e.worker_id)
      throw new AppError("Event worker does not match the task.");
    if (run.producer_id !== e.producer_id)
      throw new AppError("Event producer does not own this run.", 403);
    const inserted = await tx.query(
      sql`INSERT INTO marketing_factory.worker_events(event_id,task_id,run_id,producer_id,sequence,event_type,step_id,message,occurred_at) VALUES(${e.event_id},${e.task_id},${e.run_id},${e.producer_id},${e.sequence},${e.event_type},${e.step_id ?? null},${e.message},${e.occurred_at}) ON CONFLICT DO NOTHING RETURNING id`,
    );
    if (!inserted.length) return { accepted: true, duplicate: true };
    if (e.sequence <= Number(run.sequence) || terminalRuns.has(run.status))
      return { accepted: true, duplicate: false };
    // The engine owns remote completion. Local reports can never override it.
    if (
      run.engine_run_id &&
      ["run.completed", "run.failed"].includes(e.event_type)
    )
      throw new AppError(
        "Remote completion is reported by the engine adapter.",
      );
    if (run.engine_run_id) {
      await tx.query(
        sql`UPDATE marketing_factory.task_runs SET sequence=${e.sequence} WHERE id=${run.id}`,
      );
      return { accepted: true, duplicate: false };
    }
    let runStatus = "running";
    let taskStatus = "running";
    if (e.event_type === "run.completed") {
      runStatus = "succeeded";
      taskStatus = "waiting_review";
      const [latest] = await tx.query<Artifact>(
        sql`SELECT * FROM marketing_factory.artifacts WHERE task_id=${task.id} AND type IN ('script_package','video') ORDER BY created_at DESC,id DESC LIMIT 1`,
      );
      if (
        latest?.review_status === "approved" &&
        latest.run_id === run.id &&
        (latest.type !== "video" || latest.drive_url)
      )
        taskStatus = "completed";
    }
    if (e.event_type === "run.failed") {
      runStatus = "failed";
      taskStatus = "failed";
    }
    if (e.event_type === "review.requested") taskStatus = "waiting_review";
    await tx.query(
      sql`UPDATE marketing_factory.task_runs SET status=${runStatus},sequence=${e.sequence},heartbeat_at=now(),finished_at=${terminalRuns.has(runStatus) ? new Date() : null} WHERE id=${run.id}`,
    );
    if (task.current_run_id === run.id && e.event_type !== "worker.heartbeat")
      await tx.query(
        sql`UPDATE marketing_factory.tasks SET status=${taskStatus},updated_at=now() WHERE id=${task.id}`,
      );
    return { accepted: true, duplicate: false };
  });
}

export async function importPackage(
  db: FactoryDb,
  taskId: string,
  input: unknown,
  identity?: { run_id: string; producer_id: string },
) {
  const value = validateScriptPackage(input);
  const body = JSON.stringify(value);
  const hash = createHash("sha256").update(body).digest("hex");
  const storageKey =
    db.mode === "neon"
      ? await (await import("./storage")).writePackageObject(taskId, hash, body)
      : null;
  return db.transaction(async (tx) => {
    const [task] = await tx.query<Task>(
      sql`SELECT * FROM marketing_factory.tasks WHERE id=${taskId} FOR UPDATE`,
    );
    if (!task || task.worker_id !== "script_writer")
      throw new AppError("A Script Writer task is required.");
    let producingRun: Run | undefined;
    if (identity) {
      [producingRun] = await tx.query<Run>(
        sql`SELECT * FROM marketing_factory.task_runs WHERE id=${identity.run_id} AND task_id=${taskId}`,
      );
      if (
        !producingRun ||
        producingRun.id !== task.current_run_id ||
        producingRun.producer_id !== identity.producer_id
      )
        throw new AppError("Package does not belong to the current run.", 409);
    }
    const [existing] = await tx.query<Artifact>(
      sql`SELECT * FROM marketing_factory.artifacts WHERE task_id=${taskId} AND sha256=${hash} AND type='script_package' AND run_id IS NOT DISTINCT FROM ${task.current_run_id}::uuid`,
    );
    if (existing) return existing;
    if (producingRun && terminalRuns.has(producingRun.status))
      throw new AppError(
        "This run ended. Start a new run for a new draft.",
        409,
      );
    const [artifact] = await tx.query<Artifact>(
      sql`INSERT INTO marketing_factory.artifacts(id,task_id,run_id,title,type,sha256,bytes,content_json,storage_key) VALUES(${randomUUID()},${taskId},${task.current_run_id},${value.campaign_name + " · " + value.week},'script_package',${hash},${Buffer.byteLength(body)},${db.mode === "local" ? JSON.stringify(value) : null}::jsonb,${storageKey}) RETURNING *`,
    );
    await tx.query(
      sql`UPDATE marketing_factory.tasks SET status='waiting_review',updated_at=now() WHERE id=${taskId}`,
    );
    return artifact;
  });
}

export async function reviewArtifact(
  db: FactoryDb,
  id: string,
  hash: string,
  decision: "approved" | "rejected",
  note: string,
) {
  return db.transaction(async (tx) => {
    const [candidate] = await tx.query<Artifact>(
      sql`SELECT * FROM marketing_factory.artifacts WHERE id=${id}`,
    );
    if (!candidate) throw new AppError("Artifact not found.", 404);
    if (!["script_package", "video"].includes(candidate.type))
      throw new AppError(
        "This is supporting evidence, not a reviewable output.",
      );
    // Same lock order as imports prevents approval racing a new revision.
    const [task] = await tx.query<Task>(
      sql`SELECT * FROM marketing_factory.tasks WHERE id=${candidate.task_id} FOR UPDATE`,
    );
    const [artifact] = await tx.query<Artifact>(
      sql`SELECT * FROM marketing_factory.artifacts WHERE id=${id}`,
    );
    if (artifact.sha256 !== hash)
      throw new AppError("This revision has changed.", 409);
    const [latest] = await tx.query<Artifact>(
      sql`SELECT * FROM marketing_factory.artifacts WHERE task_id=${artifact.task_id} AND type=${artifact.type} ORDER BY created_at DESC,id DESC LIMIT 1`,
    );
    if (latest.id !== id)
      throw new AppError("Only the latest revision can be approved.", 409);
    if (artifact.run_id !== task.current_run_id)
      throw new AppError("Review the output from the current run.", 409);
    await tx.query(
      sql`UPDATE marketing_factory.artifacts SET review_status=${decision},review_note=${note},approved_at=${decision === "approved" ? new Date() : null} WHERE id=${id}`,
    );
    const status =
      decision === "rejected"
        ? "planned"
        : artifact.type === "video" && !artifact.drive_url
          ? "waiting_review"
          : "completed";
    await tx.query(
      sql`UPDATE marketing_factory.tasks SET status=${status},updated_at=now() WHERE id=${artifact.task_id}`,
    );
    return { decision, status };
  });
}

export async function taskDetail(db: DbSession, id: string) {
  const [task] = await db.query<Task>(
    sql`SELECT * FROM marketing_factory.tasks WHERE id=${id}`,
  );
  if (!task) throw new AppError("Task not found.", 404);
  const [runs, events, artifacts] = await Promise.all([
    db.query(
      sql`SELECT * FROM marketing_factory.task_runs WHERE task_id=${id} ORDER BY started_at DESC`,
    ),
    db.query(
      sql`SELECT event_id,run_id,event_type,step_id,message,occurred_at,received_at FROM marketing_factory.worker_events WHERE task_id=${id} ORDER BY id DESC LIMIT 100`,
    ),
    db.query<Artifact>(
      sql`SELECT a.*,d.id AS delivery_job_id,d.status AS delivery_status,d.error AS delivery_error FROM marketing_factory.artifacts a LEFT JOIN marketing_factory.delivery_jobs d ON d.artifact_id=a.id WHERE a.task_id=${id} ORDER BY a.created_at DESC`,
    ),
  ]);
  for (const artifact of artifacts) {
    if (
      artifact.type === "script_package" &&
      !artifact.content_json &&
      artifact.storage_key
    ) {
      if (
        artifact.storage_key !==
        `marketing-factory/v1/tasks/${id}/scripts/${artifact.sha256}.json`
      )
        throw new AppError("Invalid script storage reference.", 500);
      const bytes = await (
        await import("./storage")
      ).readObject(artifact.storage_key);
      if (
        bytes.byteLength !== Number(artifact.bytes) ||
        createHash("sha256").update(bytes).digest("hex") !== artifact.sha256
      )
        throw new AppError("Stored script failed checksum verification.", 502);
      artifact.content_json = validateScriptPackage(
        JSON.parse(Buffer.from(bytes).toString("utf8")),
      );
    }
  }
  return { task, runs, events, artifacts };
}

export async function setManualStatus(
  db: FactoryDb,
  id: string,
  status: string,
) {
  return db.transaction(async (tx) => {
    const [task] = await tx.query<Task>(
      sql`SELECT * FROM marketing_factory.tasks WHERE id=${id} FOR UPDATE`,
    );
    if (!task) throw new AppError("Task not found.", 404);
    if (task.current_run_id) {
      const [run] = await tx.query<Run>(
        sql`SELECT * FROM marketing_factory.task_runs WHERE id=${task.current_run_id}`,
      );
      if (run && !terminalRuns.has(run.status))
        throw new AppError(
          "An active instrumented run owns this status. Report its result or interrupt it first.",
          409,
        );
    }
    if (status === "completed") {
      const [artifact] = await tx.query<Artifact>(
        sql`SELECT * FROM marketing_factory.artifacts WHERE task_id=${id} AND type IN ('script_package','video') ORDER BY created_at DESC,id DESC LIMIT 1`,
      );
      if (
        ["script_writer", "video_editor"].includes(task.worker_id) &&
        (!artifact ||
          artifact.run_id !== task.current_run_id ||
          (task.worker_id === "video_editor" && artifact.type !== "video"))
      )
        throw new AppError(
          "A current, approved output is required before completion.",
          409,
        );
      if (
        artifact &&
        (artifact.review_status !== "approved" ||
          (artifact.type === "video" && !artifact.drive_url))
      )
        throw new AppError(
          "Approve the latest output and finish required delivery first.",
          409,
        );
    }
    const [updated] = await tx.query<Task>(
      sql`UPDATE marketing_factory.tasks SET status=${status},source='manual',updated_at=now() WHERE id=${id} RETURNING *`,
    );
    return updated;
  });
}

export async function attachEngine(
  db: FactoryDb,
  runId: string,
  engineId: string,
) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(engineId))
    throw new AppError("Invalid engine run ID.");
  const [run] = await db.query<Run & { worker_id: string }>(
    sql`SELECT r.*,t.worker_id FROM marketing_factory.task_runs r JOIN marketing_factory.tasks t ON t.id=r.task_id WHERE r.id=${runId}`,
  );
  if (
    !run ||
    run.worker_id !== "video_editor" ||
    terminalRuns.has(run.status) ||
    run.engine_run_id
  )
    throw new AppError("An active, unattached Video Editor run is required.");
  await db.query(
    sql`UPDATE marketing_factory.task_runs SET engine_run_id=${engineId},origin='railway_worker' WHERE id=${runId} AND engine_run_id IS NULL`,
  );
  return { run_id: runId, engine_run_id: engineId };
}
