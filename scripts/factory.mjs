#!/usr/bin/env node
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
  rmdir,
  access,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
const [command = "help", ...args] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith("--") || !args[i + 1] || args[i + 1].startsWith("--"))
    throw new Error("Use --name value arguments.");
  flags[args[i].slice(2)] = args[++i];
}
const stateDir =
  process.env.FACTORY_STATE_DIR ?? path.join(root, ".data/bridge");
function need(key) {
  if (!flags[key]) throw new Error(`Missing --${key}`);
  return flags[key];
}
function id(value) {
  if (!/^[a-f0-9-]{36}$/i.test(value))
    throw new Error("Invalid task or run ID.");
  return value;
}
async function save(file, data) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + randomUUID() + ".tmp";
  await writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await rename(tmp, file);
}
async function send(endpoint, body) {
  const base = process.env.FACTORY_URL || process.env.APP_URL;
  if (!base || !process.env.FACTORY_BRIDGE_TOKEN)
    throw new Error("Configure FACTORY_URL and FACTORY_BRIDGE_TOKEN.");
  const url = new URL(base);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Remote bridge connections require HTTPS.");
  const response = await fetch(new URL("/api/internal/" + endpoint, url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FACTORY_BRIDGE_TOKEN}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  const reply = await response.json();
  if (!response.ok)
    throw new Error(
      reply.error ?? `Factory request failed (${response.status}).`,
    );
  return reply;
}
async function flush() {
  const folder = path.join(stateDir, "outbox");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  let delivered = 0;
  for (const name of (await readdir(folder))
    .filter((n) => n.endsWith(".json"))
    .sort()) {
    const file = path.join(folder, name);
    await send("worker-events", JSON.parse(await readFile(file, "utf8")));
    await unlink(file);
    delivered++;
  }
  return delivered;
}
async function report() {
  const runId = id(need("run"));
  const folder = path.join(stateDir, "runs");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const lock = path.join(folder, runId + ".lock");
  try {
    await mkdir(lock);
  } catch {
    throw new Error(
      "Another reporter owns this run. Retry after it finishes; inspect a stale lock before removing it.",
    );
  }
  try {
    const stateFile = path.join(folder, runId + ".json");
    const state = JSON.parse(await readFile(stateFile, "utf8"));
    state.sequence++;
    const event = {
      event_id: randomUUID(),
      task_id: state.task_id,
      run_id: runId,
      worker_id: state.worker_id,
      producer_id: state.producer_id,
      sequence: state.sequence,
      event_type: need("type"),
      step_id: flags.step,
      message: flags.message ?? "",
      occurred_at: new Date().toISOString(),
    };
    // Save the monotonic counter before queuing; a crash may leave a gap, never a duplicate sequence.
    await save(stateFile, state);
    await save(path.join(stateDir, "outbox", event.event_id + ".json"), event);
    try {
      console.log(
        JSON.stringify({
          queued: false,
          delivered: await flush(),
          event_id: event.event_id,
        }),
      );
    } catch {
      console.log(
        JSON.stringify({
          queued: true,
          event_id: event.event_id,
          message: "Report saved locally. Use flush after reconnecting.",
        }),
      );
    }
  } finally {
    await rmdir(lock);
  }
}
async function main() {
  if (command === "help") {
    console.log(
      `Marketing Factory reporter — no agent or model is launched.\n\ncreate --title TEXT --worker script_writer|video_editor [--description TEXT]\nstart --task UUID\nevent --run UUID --type step.started --step audience --message TEXT\npackage --run UUID --file /absolute/package.json\nattach-video --run UUID --engine-run-id EXISTING_ENGINE_ID\nflush\n\nRun IDs are printed by start. Report only real observed stages.\nFactory credentials come from environment or the project's private .env.local.`,
    );
    return;
  }
  if (command === "create") {
    console.log(
      JSON.stringify(
        await send("tasks", {
          title: need("title"),
          worker_id: need("worker"),
          description: flags.description ?? "",
          campaign_id: flags.campaign ?? null,
        }),
        null,
        2,
      ),
    );
    return;
  }
  if (command === "start") {
    const run = await send("runs", {
      task_id: id(need("task")),
      producer_id: "codex-" + randomUUID(),
    });
    await save(path.join(stateDir, "runs", run.id + ".json"), {
      ...run,
      sequence: 0,
    });
    console.log(JSON.stringify(run, null, 2));
    return;
  }
  if (command === "event") {
    await report();
    return;
  }
  if (command === "package") {
    const runId = id(need("run"));
    const run = JSON.parse(
      await readFile(path.join(stateDir, "runs", runId + ".json"), "utf8"),
    );
    if (flags.task && id(flags.task) !== run.task_id)
      throw new Error("Task does not match this reporting run.");
    const file = path.resolve(need("file"));
    await access(file);
    const content = JSON.parse(await readFile(file, "utf8"));
    const result = await send("packages", {
      task_id: run.task_id,
      run_id: runId,
      producer_id: run.producer_id,
      package: content,
    });
    console.log(
      JSON.stringify({
        artifact_id: result.id,
        sha256: result.sha256,
        review_status: result.review_status,
      }),
    );
    return;
  }
  if (command === "attach-video") {
    console.log(
      JSON.stringify(
        await send("engine", {
          run_id: id(need("run")),
          engine_run_id: need("engine-run-id"),
        }),
      ),
    );
    return;
  }
  if (command === "flush") {
    console.log(JSON.stringify({ delivered: await flush() }));
    return;
  }
  throw new Error("Unknown command. Run help.");
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
