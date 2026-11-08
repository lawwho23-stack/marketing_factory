import { z } from "zod";

export const workerIds = [
  "script_writer",
  "video_editor",
  "crm",
  "finance",
] as const;
export type WorkerId = (typeof workerIds)[number];
export const taskStatuses = [
  "planned",
  "queued",
  "running",
  "waiting_review",
  "completed",
  "failed",
  "cancelled",
] as const;
export const eventTypes = [
  "run.started",
  "step.started",
  "step.completed",
  "step.failed",
  "artifact.created",
  "review.requested",
  "run.completed",
  "run.failed",
  "worker.heartbeat",
] as const;
export const terminalRuns = new Set(["succeeded", "failed", "interrupted"]);

export function projectEvent(
  current: { status: string; sequence: number },
  incoming: { status: string; sequence: number },
) {
  if (incoming.sequence <= current.sequence || terminalRuns.has(current.status))
    return current;
  return incoming;
}

export function validateMoney(amount: string, currency: string) {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(amount) || !/[1-9]/.test(amount))
    throw new Error("Enter a positive amount with at most two decimal places.");
  const normalized = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized))
    throw new Error("Use a three-letter currency code.");
  return { amount, currency: normalized };
}

export const scriptSchema = z.object({
  script_id: z.string().min(1).max(100),
  day: z.number().int().min(1).max(14),
  category: z.enum(["educational", "demo_or_proof"]),
  title: z.string().min(1).max(250),
  target_audience: z.string().min(1).max(500),
  language: z.enum(["my", "en"]),
  estimated_duration_seconds: z.number().int().min(15).max(180),
  hook_options: z.array(z.string().min(1)).length(3),
  selected_hook: z.string().min(1),
  body_sections: z
    .array(
      z.object({
        type: z.string(),
        voiceover: z.string().min(1),
        visual_direction: z.string(),
      }),
    )
    .min(1),
  cta: z.string(),
  overlay_text: z.array(z.string()),
  editor_notes: z.string(),
  claim_sources: z.array(
    z.object({
      claim: z.string(),
      url: z.url({ protocol: /^https$/ }),
      checked_at: z.iso.date(),
    }),
  ),
});
export const packageSchema = z
  .object({
    schema_version: z.literal(1),
    campaign_name: z.string().min(1).max(200),
    target_audience: z.string().min(1).max(500),
    week: z.string().min(1).max(100),
    overview: z.string().max(20000),
    research: z.string().max(30000),
    review_notes: z.string().max(20000),
    scripts: z.array(scriptSchema).min(1).max(14),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.scripts.map((s) => s.script_id)).size !==
      value.scripts.length
    )
      ctx.addIssue({ code: "custom", message: "Script IDs must be unique." });
    if (new Set(value.scripts.map((s) => s.day)).size !== value.scripts.length)
      ctx.addIssue({ code: "custom", message: "Script days must be unique." });
    for (const s of value.scripts) {
      if (s.target_audience !== value.target_audience)
        ctx.addIssue({
          code: "custom",
          message: "Every script must use the package audience.",
        });
      if (!s.hook_options.includes(s.selected_hook))
        ctx.addIssue({
          code: "custom",
          message: "Selected hook must be one of the three options.",
        });
    }
  });
export type ScriptPackage = z.infer<typeof packageSchema>;
export function validateScriptPackage(input: unknown) {
  return packageSchema.parse(input);
}

export const eventSchema = z.object({
  event_id: z.uuid(),
  task_id: z.uuid(),
  run_id: z.uuid(),
  worker_id: z.enum(workerIds),
  producer_id: z.string().min(1).max(100),
  sequence: z.number().int().nonnegative(),
  event_type: z.enum(eventTypes),
  step_id: z.string().max(100).optional(),
  message: z.string().max(500).default(""),
  occurred_at: z.iso.datetime(),
});
export type FactoryEvent = z.infer<typeof eventSchema>;
export const taskSchema = z.object({
  title: z.string().trim().min(3).max(180),
  worker_id: z.enum(workerIds),
  campaign_id: z.uuid().nullable().optional(),
  description: z.string().max(4000).default(""),
});
export const leadSchema = z.object({
  name: z.string().trim().min(1).max(150),
  company: z.string().max(150).default(""),
  contact: z.string().max(250).default(""),
  source: z.string().max(100).default("Manual"),
  stage: z
    .enum(["new", "contacted", "qualified", "proposal", "won", "lost"])
    .default("new"),
  next_follow_up: z.iso.date().nullable().default(null),
  notes: z.string().max(5000).default(""),
  campaign_id: z.uuid().nullable().default(null),
});
export const transactionSchema = z
  .object({
    type: z.enum(["income", "expense"]),
    amount: z.string(),
    currency: z.string(),
    category: z.string().min(1).max(100),
    transaction_date: z.iso.date(),
    note: z.string().max(2000).default(""),
    campaign_id: z.uuid().nullable().default(null),
    lead_id: z.uuid().nullable().default(null),
  })
  .superRefine((value, context) => {
    try {
      validateMoney(value.amount, value.currency);
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: (error as Error).message,
      });
    }
  })
  .transform((v) => ({ ...v, ...validateMoney(v.amount, v.currency) }));

export const workerDefinitions = [
  {
    id: "script_writer",
    name: "Script Writer",
    role: "Ideas into words",
    mode: "local_codex",
    color: "#dcb768",
    initials: "SW",
  },
  {
    id: "video_editor",
    name: "Video Editor",
    role: "Stories into motion",
    mode: "local_codex",
    color: "#8cb8b7",
    initials: "VE",
  },
  {
    id: "crm",
    name: "Lead Tracker",
    role: "Keep the conversation going",
    mode: "manual",
    color: "#b1a0ce",
    initials: "CRM",
  },
  {
    id: "finance",
    name: "Finance",
    role: "Make the numbers count",
    mode: "manual",
    color: "#a4bc86",
    initials: "FIN",
  },
] as const;
