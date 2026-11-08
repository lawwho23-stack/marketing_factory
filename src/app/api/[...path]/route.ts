import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/database";
import {
  requireOwner,
  requireBridge,
  requireSameOrigin,
  login,
  logout,
  ownerSession,
} from "@/lib/auth";
import {
  AppError,
  createTask,
  listTasks,
  registerRun,
  ingestEvent,
  importPackage,
  reviewArtifact,
  taskDetail,
  setManualStatus,
  attachEngine,
} from "@/lib/store";
import {
  eventSchema,
  leadSchema,
  transactionSchema,
  taskStatuses,
} from "@/lib/domain";
import { getOverview, getBusinessExport } from "@/lib/overview";
import { googleConnectUrl, finishGoogleConnect } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const uuid = z.uuid();
async function jsonBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("Send application/json.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw new AppError("Request is too large.", 413);
      }
      chunks.push(result.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Invalid JSON body.");
  }
}
async function dispatch(request: Request, context: Context) {
  const segments = (await context.params).path;
  const route = segments.join("/");
  const method = request.method;
  const parameters = new URL(request.url).searchParams;
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(10000000)
    .parse(parameters.get("offset") ?? 0);
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .parse(parameters.get("limit") ?? 200);
  const search = z
    .string()
    .max(100)
    .parse(parameters.get("search") ?? "");
  if (route === "health" && method === "GET")
    return NextResponse.json({ ok: true, service: "marketing-factory" });
  if (route === "ready" && method === "GET") {
    try {
      if (
        !process.env.AUTH_SECRET ||
        !process.env.OWNER_PASSWORD_HASH ||
        !process.env.APP_URL
      )
        throw new Error("Configuration incomplete.");
      const db = await getDb();
      const [row] = await db.query<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM marketing_factory.workers`,
      );
      if (row.count !== 4) throw new Error("Worker definitions missing.");
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ ok: false }, { status: 503 });
    }
  }
  if (route === "auth/login" && method === "POST") {
    const body = z
      .object({ password: z.string().min(1).max(256) })
      .parse(await jsonBody(request));
    await login(request, body.password);
    return NextResponse.json({ ok: true });
  }
  const internal = segments[0] === "internal";
  if (internal) requireBridge(request);
  else {
    await requireOwner();
    if (method !== "GET") requireSameOrigin(request);
  }
  const db = await getDb();
  if (internal) {
    const [rate] = await db.query<{ attempts: number }>(
      sql`INSERT INTO marketing_factory.login_attempts(key,attempts,expires_at) VALUES('bridge-ingestion',1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN marketing_factory.login_attempts.expires_at<now() THEN 1 ELSE marketing_factory.login_attempts.attempts+1 END,expires_at=CASE WHEN marketing_factory.login_attempts.expires_at<now() THEN now()+interval '1 minute' ELSE marketing_factory.login_attempts.expires_at END RETURNING attempts`,
    );
    if (rate.attempts > 300)
      throw new AppError(
        "Bridge rate limit reached. Keep the outbox and retry after one minute.",
        429,
      );
    if (method !== "POST")
      throw new AppError("Bridge access is write-only.", 403);
    const body = await jsonBody(request);
    if (route === "internal/tasks")
      return NextResponse.json(await createTask(db, body, "local_codex"), {
        status: 201,
      });
    if (route === "internal/runs") {
      const v = z
        .object({ task_id: uuid, producer_id: z.string().min(1).max(100) })
        .parse(body);
      return NextResponse.json(
        await registerRun(db, v.task_id, v.producer_id),
        { status: 201 },
      );
    }
    if (route === "internal/worker-events")
      return NextResponse.json(await ingestEvent(db, eventSchema.parse(body)));
    if (route === "internal/packages") {
      const v = z
        .object({
          task_id: uuid,
          run_id: uuid,
          producer_id: z.string().min(1).max(100),
          package: z.unknown(),
        })
        .parse(body);
      return NextResponse.json(
        await importPackage(db, v.task_id, v.package, {
          run_id: v.run_id,
          producer_id: v.producer_id,
        }),
        {
          status: 201,
        },
      );
    }
    if (route === "internal/engine") {
      const v = z
        .object({ run_id: uuid, engine_run_id: z.string() })
        .parse(body);
      return NextResponse.json(
        await attachEngine(db, v.run_id, v.engine_run_id),
      );
    }
    throw new AppError("Unknown bridge endpoint.", 404);
  }
  if (route === "auth/logout" && method === "POST") {
    await logout();
    return NextResponse.json({ ok: true });
  }
  if (route === "factory/overview" && method === "GET")
    return NextResponse.json(await getOverview(db));
  if (route === "tasks" && method === "POST")
    return NextResponse.json(await createTask(db, await jsonBody(request)), {
      status: 201,
    });
  if (route === "tasks" && method === "GET")
    return NextResponse.json(
      await listTasks(db, {
        offset,
        limit,
        search,
        worker: parameters.get("worker") ?? undefined,
        status: parameters.get("status") ?? undefined,
      }),
    );
  if (route === "activity" && method === "GET")
    return NextResponse.json(
      await db.query(
        sql`SELECT e.event_id,e.event_type,e.step_id,e.message,e.received_at,t.title,t.worker_id FROM marketing_factory.worker_events e JOIN marketing_factory.tasks t ON t.id=e.task_id ORDER BY e.id DESC LIMIT ${limit} OFFSET ${offset}`,
      ),
    );
  if (
    segments[0] === "tasks" &&
    segments.length === 3 &&
    segments[2] === "events" &&
    method === "GET"
  )
    return NextResponse.json(
      await db.query(
        sql`SELECT event_id,run_id,event_type,step_id,message,occurred_at,received_at FROM marketing_factory.worker_events WHERE task_id=${uuid.parse(segments[1])} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
      ),
    );
  if (segments[0] === "tasks" && segments.length === 2) {
    const id = uuid.parse(segments[1]);
    if (method === "GET") return NextResponse.json(await taskDetail(db, id));
    if (method === "PATCH") {
      const v = z
        .object({ status: z.enum(taskStatuses) })
        .parse(await jsonBody(request));
      return NextResponse.json(await setManualStatus(db, id, v.status));
    }
  }
  if (
    segments[0] === "runs" &&
    segments.length === 3 &&
    segments[2] === "interrupt" &&
    method === "POST"
  ) {
    const id = uuid.parse(segments[1]);
    const v = z
      .object({ note: z.string().min(3).max(500) })
      .parse(await jsonBody(request));
    await db.transaction(async (tx) => {
      const [run] = await tx.query<{
        id: string;
        task_id: string;
        engine_run_id: string | null;
        status: string;
      }>(sql`SELECT * FROM marketing_factory.task_runs WHERE id=${id}`);
      if (!run) throw new AppError("Run not found.", 404);
      if (run.engine_run_id)
        throw new AppError(
          "Remote runs must be inspected and stopped through the existing editor workflow; this dashboard cannot stop them.",
          409,
        );
      await tx.query(
        sql`SELECT id FROM marketing_factory.tasks WHERE id=${run.task_id} FOR UPDATE`,
      );
      const updated = await tx.query(
        sql`UPDATE marketing_factory.task_runs SET status='interrupted',finished_at=now() WHERE id=${id} AND status IN ('started','running') RETURNING id`,
      );
      if (!updated.length) throw new AppError("Run is already terminal.", 409);
      await tx.query(
        sql`UPDATE marketing_factory.tasks SET status='cancelled',source='manual',updated_at=now() WHERE id=${run.task_id} AND current_run_id=${id}`,
      );
      await tx.query(
        sql`INSERT INTO marketing_factory.worker_events(event_id,task_id,run_id,producer_id,sequence,event_type,message,occurred_at) VALUES(${randomUUID()},${run.task_id},${id},'owner',0,'run.interrupted',${v.note},now())`,
      );
    });
    return NextResponse.json({ ok: true });
  }
  if (
    segments[0] === "artifacts" &&
    segments[2] === "review" &&
    method === "POST"
  ) {
    const v = z
      .object({
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(2000).default(""),
      })
      .parse(await jsonBody(request));
    return NextResponse.json(
      await reviewArtifact(
        db,
        uuid.parse(segments[1]),
        v.sha256,
        v.decision,
        v.note,
      ),
    );
  }
  if (route === "packages" && method === "POST") {
    const v = z
      .object({ task_id: uuid, package: z.unknown() })
      .parse(await jsonBody(request));
    return NextResponse.json(await importPackage(db, v.task_id, v.package), {
      status: 201,
    });
  }
  if (route === "campaigns") {
    if (method === "GET")
      return NextResponse.json(
        await db.query(
          sql`SELECT * FROM marketing_factory.campaigns ORDER BY created_at DESC LIMIT 100`,
        ),
      );
    if (method === "POST") {
      const v = z
        .object({
          name: z.string().min(1).max(150),
          audience: z.string().min(1).max(500),
          goal: z.string().max(1000).default(""),
        })
        .parse(await jsonBody(request));
      const [row] = await db.query(
        sql`INSERT INTO marketing_factory.campaigns(id,name,audience,goal) VALUES(${randomUUID()},${v.name},${v.audience},${v.goal}) RETURNING *`,
      );
      return NextResponse.json(row, { status: 201 });
    }
  }
  if (route === "leads" && method === "GET")
    return NextResponse.json(
      await db.query(
        sql`SELECT * FROM marketing_factory.leads WHERE name ILIKE ${"%" + search + "%"} OR company ILIKE ${"%" + search + "%"} ORDER BY updated_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`,
      ),
    );
  if (route === "leads" && method === "POST") {
    const v = leadSchema.parse(await jsonBody(request));
    const [row] = await db.query(
      sql`INSERT INTO marketing_factory.leads(id,name,company,contact,source,stage,next_follow_up,notes,campaign_id) VALUES(${randomUUID()},${v.name},${v.company},${v.contact},${v.source},${v.stage},${v.next_follow_up},${v.notes},${v.campaign_id}) RETURNING *`,
    );
    return NextResponse.json(row, { status: 201 });
  }
  if (segments[0] === "leads" && segments.length === 2 && method === "PATCH") {
    const id = uuid.parse(segments[1]);
    const v = leadSchema.parse(await jsonBody(request));
    const row = await db.transaction(async (tx) => {
      const [lead] = await tx.query(
        sql`UPDATE marketing_factory.leads SET name=${v.name},company=${v.company},contact=${v.contact},source=${v.source},stage=${v.stage},next_follow_up=${v.next_follow_up},notes=${v.notes},campaign_id=${v.campaign_id},updated_at=now() WHERE id=${id} RETURNING *`,
      );
      if (!lead) throw new AppError("Lead not found.", 404);
      await tx.query(
        sql`INSERT INTO marketing_factory.crm_activities(id,lead_id,kind,notes) VALUES(${randomUUID()},${id},'updated',${"Stage: " + v.stage + "; " + v.notes})`,
      );
      return lead;
    });
    return NextResponse.json(row);
  }
  if (
    segments[0] === "leads" &&
    segments[2] === "activities" &&
    method === "GET"
  )
    return NextResponse.json(
      await db.query(
        sql`SELECT * FROM marketing_factory.crm_activities WHERE lead_id=${uuid.parse(segments[1])} ORDER BY occurred_at DESC LIMIT 100`,
      ),
    );
  if (route === "finance/transactions" && method === "GET")
    return NextResponse.json(
      await db.query(
        sql`SELECT *,amount::text AS amount FROM marketing_factory.finance_transactions WHERE category ILIKE ${"%" + search + "%"} OR note ILIKE ${"%" + search + "%"} ORDER BY transaction_date DESC,created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`,
      ),
    );
  if (route === "finance/transactions" && method === "POST") {
    const v = transactionSchema.parse(await jsonBody(request));
    const [row] = await db.query(
      sql`INSERT INTO marketing_factory.finance_transactions(id,type,amount,currency,category,transaction_date,note,campaign_id,lead_id) VALUES(${randomUUID()},${v.type},${v.amount},${v.currency},${v.category},${v.transaction_date},${v.note},${v.campaign_id},${v.lead_id}) RETURNING *`,
    );
    return NextResponse.json(row, { status: 201 });
  }
  if (
    segments[0] === "finance" &&
    segments[1] === "transactions" &&
    segments.length === 3 &&
    method === "PATCH"
  ) {
    const v = transactionSchema.parse(await jsonBody(request));
    const [row] = await db.query(
      sql`UPDATE marketing_factory.finance_transactions SET type=${v.type},amount=${v.amount},currency=${v.currency},category=${v.category},transaction_date=${v.transaction_date},note=${v.note},campaign_id=${v.campaign_id},lead_id=${v.lead_id},updated_at=now() WHERE id=${uuid.parse(segments[2])} RETURNING *`,
    );
    if (!row) throw new AppError("Transaction not found.", 404);
    return NextResponse.json(row);
  }
  if (route === "integrations/google/connect" && method === "POST") {
    const session = await ownerSession();
    session.oauthState = randomUUID();
    await session.save();
    return NextResponse.json({ url: googleConnectUrl(session.oauthState) });
  }
  if (route === "integrations/google/callback" && method === "GET") {
    const url = new URL(request.url);
    const session = await ownerSession();
    const state = session.oauthState;
    delete session.oauthState;
    await session.save();
    if (!state || state !== url.searchParams.get("state"))
      throw new AppError("Google connection request expired.", 403);
    const code = url.searchParams.get("code");
    if (!code) throw new AppError("Google authorization was not granted.");
    await finishGoogleConnect(db, code);
    return NextResponse.redirect(
      new URL("/settings?connected=google", request.url),
    );
  }
  if (
    segments[0] === "delivery" &&
    segments[2] === "retry" &&
    method === "POST"
  ) {
    const id = uuid.parse(segments[1]);
    const rows = await db.query(
      sql`UPDATE marketing_factory.delivery_jobs SET status='pending',attempts=0,next_attempt_at=now(),error=NULL WHERE id=${id} AND status IN ('failed','pending','needs_reconnect') RETURNING id`,
    );
    if (!rows.length)
      throw new AppError(
        "Delivery is currently active or already complete.",
        409,
      );
    return NextResponse.json({ ok: true });
  }
  if (route === "export" && method === "GET") {
    return NextResponse.json(await getBusinessExport(db), {
      headers: {
        "Content-Disposition":
          'attachment; filename="marketing-factory-export.json"',
      },
    });
  }
  throw new AppError("Endpoint not found.", 404);
}
async function handle(request: Request, context: Context) {
  try {
    return await dispatch(request, context);
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues.map((i) => i.message).join(" ") },
        { status: 400 },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    const code = (error as { code?: string }).code;
    if (code === "23505")
      return NextResponse.json(
        { error: "This record already exists." },
        { status: 409 },
      );
    if (code === "23503")
      return NextResponse.json(
        { error: "A linked record was not found." },
        { status: 400 },
      );
    console.error("Factory API failed", {
      code: code ?? "internal",
      request_id: randomUUID(),
    });
    return NextResponse.json(
      {
        error:
          "Unable to complete this request. Check server configuration and logs.",
      },
      { status: 500 },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH };
