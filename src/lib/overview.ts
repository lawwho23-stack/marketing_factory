import { sql } from "drizzle-orm";
import { type FactoryDb } from "./database";
import { listTasks } from "./store";
import { workerDefinitions } from "./domain";

export async function getOverview(db: FactoryDb) {
  const [
    tasks,
    artifacts,
    leads,
    finance,
    events,
    campaigns,
    delivery,
    integration,
    activeTasks,
    totals,
    leadStages,
  ] = await Promise.all([
    listTasks(db),
    db.query(
      sql`SELECT a.id,a.task_id,a.title,a.type,a.review_status,a.created_at,a.drive_url,d.status AS delivery_status FROM marketing_factory.artifacts a LEFT JOIN marketing_factory.delivery_jobs d ON d.artifact_id=a.id ORDER BY a.created_at DESC LIMIT 20`,
    ),
    db.query(
      sql`SELECT * FROM marketing_factory.leads ORDER BY updated_at DESC LIMIT 200`,
    ),
    db.query(
      sql`SELECT currency,COALESCE(sum(amount) FILTER(WHERE type='income'),0)::text AS income,COALESCE(sum(amount) FILTER(WHERE type='expense'),0)::text AS expense,COALESCE(sum(CASE WHEN type='income' THEN amount ELSE -amount END),0)::text AS balance FROM marketing_factory.finance_transactions GROUP BY currency ORDER BY currency`,
    ),
    db.query(
      sql`SELECT e.event_id,e.event_type,e.step_id,e.message,e.received_at,t.title,t.worker_id FROM marketing_factory.worker_events e JOIN marketing_factory.tasks t ON t.id=e.task_id ORDER BY e.id DESC LIMIT 30`,
    ),
    db.query(
      sql`SELECT c.*,(SELECT count(*)::int FROM marketing_factory.tasks t WHERE t.campaign_id=c.id) AS tasks FROM marketing_factory.campaigns c ORDER BY c.created_at DESC LIMIT 100`,
    ),
    db.query(
      sql`SELECT d.id,d.status,d.error,d.attempts,d.updated_at,a.title,a.task_id FROM marketing_factory.delivery_jobs d JOIN marketing_factory.artifacts a ON a.id=d.artifact_id ORDER BY CASE WHEN d.status='delivered' THEN 1 ELSE 0 END,d.updated_at DESC LIMIT 20`,
    ),
    db.query<{ id: string; value_json: Record<string, unknown> }>(
      sql`SELECT id,value_json FROM marketing_factory.integrations WHERE id IN ('google_drive','delivery_worker')`,
    ),
    db.query<import("./store").Task>(
      sql`SELECT DISTINCT ON(t.worker_id) t.*,r.status AS run_status,r.heartbeat_at,r.engine_run_id,r.origin,r.engine_updated_at FROM marketing_factory.tasks t LEFT JOIN marketing_factory.task_runs r ON r.id=t.current_run_id WHERE t.status IN ('running','queued','waiting_review','failed') ORDER BY t.worker_id,CASE t.status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 WHEN 'waiting_review' THEN 2 ELSE 3 END,t.updated_at DESC`,
    ),
    db.query<{ review: number; completed: number; leads: number }>(
      sql`SELECT (SELECT count(*)::int FROM marketing_factory.tasks WHERE status='waiting_review') AS review,(SELECT count(*)::int FROM marketing_factory.tasks WHERE status='completed') AS completed,(SELECT count(*)::int FROM marketing_factory.leads) AS leads`,
    ),
    db.query<{ stage: string; count: number }>(
      sql`SELECT stage,count(*)::int AS count FROM marketing_factory.leads GROUP BY stage`,
    ),
  ]);
  const now = Date.now();
  const workers = workerDefinitions.map((worker) => {
    const task = activeTasks.find(
      (t) =>
        t.worker_id === worker.id &&
        ["running", "queued", "waiting_review", "failed"].includes(t.status),
    );
    const last = tasks.find((t) => t.worker_id === worker.id);
    const reportedAt =
      task?.origin === "railway_worker"
        ? (task.engine_updated_at ?? task.updated_at)
        : (task?.heartbeat_at ?? task?.updated_at);
    const stale =
      !!task &&
      task.status === "running" &&
      now - new Date(reportedAt!).getTime() > 90000;
    return {
      ...worker,
      status:
        worker.mode === "manual"
          ? "manual"
          : task?.origin === "railway_worker" && !task.engine_updated_at
            ? "unknown"
            : stale
              ? "stale"
              : (task?.status ??
                (last?.status === "failed" ? "failed" : "idle")),
      task: task ?? last ?? null,
      last_reported: reportedAt ?? null,
    };
  });
  const drive = integration.find((i) => i.id === "google_drive");
  const deliveryWorker = integration.find((i) => i.id === "delivery_worker");
  return {
    workers,
    tasks,
    artifacts,
    leads,
    finance,
    events,
    campaigns,
    delivery,
    generated_at: new Date().toISOString(),
    database: db.mode,
    integrations: {
      drive_connected: !!drive?.value_json.refresh_token,
      google_configured: !!(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.TOKEN_ENCRYPTION_KEY
      ),
      bridge_configured: !!process.env.FACTORY_BRIDGE_TOKEN,
      storage_configured: !!process.env.S3_BUCKET,
      worker_last_seen: deliveryWorker?.value_json.last_seen ?? null,
    },
    counts: {
      active: workers.filter((w) => w.status === "running").length,
      review: totals[0].review,
      completed: totals[0].completed,
      leads: totals[0].leads,
    },
    lead_stage_counts: Object.fromEntries(
      leadStages.map((row) => [row.stage, row.count]),
    ),
  };
}
export async function getBusinessExport(db: FactoryDb) {
  const [tasks, leads, campaigns, transactions, runs, events, artifacts] =
    await Promise.all([
      db.query(sql`SELECT * FROM marketing_factory.tasks ORDER BY created_at`),
      db.query(sql`SELECT * FROM marketing_factory.leads ORDER BY created_at`),
      db.query(
        sql`SELECT * FROM marketing_factory.campaigns ORDER BY created_at`,
      ),
      db.query(
        sql`SELECT *,amount::text AS amount FROM marketing_factory.finance_transactions ORDER BY transaction_date`,
      ),
      db.query(
        sql`SELECT * FROM marketing_factory.task_runs ORDER BY started_at`,
      ),
      db.query(sql`SELECT * FROM marketing_factory.worker_events ORDER BY id`),
      db.query(
        sql`SELECT id,task_id,run_id,title,type,sha256,bytes,storage_key,drive_url,review_status,created_at FROM marketing_factory.artifacts ORDER BY created_at`,
      ),
    ]);
  return {
    exported_at: new Date().toISOString(),
    tasks,
    leads,
    campaigns,
    transactions,
    runs,
    events,
    artifacts,
  };
}
