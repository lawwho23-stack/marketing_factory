import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const password = readFileSync(".data/local-login.txt", "utf8").match(
  /password: (.+)/,
)![1];
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Owner password").fill(password);
  await page.getByRole("button", { name: "Enter the factory" }).click();
  await page.waitForURL("/");
  await expect(page.getByText("Everyone has a place.")).toBeVisible();
}
const cli = (args: string[]) =>
  JSON.parse(
    execFileSync(process.execPath, ["scripts/factory.mjs", ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        FACTORY_URL: "http://localhost:3000",
        FACTORY_STATE_DIR: ".data/acceptance-bridge",
      },
    }),
  );
test("private routes and bridge scope fail closed", async ({ request }) => {
  expect((await request.get("/api/factory/overview")).status()).toBe(401);
  expect(
    (
      await request.post("/api/internal/tasks", {
        data: { title: "Unauthorized task", worker_id: "script_writer" },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/leads", {
        headers: {
          Authorization: `Bearer ${process.env.FACTORY_BRIDGE_TOKEN}`,
        },
        data: { name: "Forbidden" },
      })
    ).status(),
  ).toBe(401);
});
test("manual CRM and Finance create, edit and persist records without mixing currencies", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Lead Tracker", exact: true }).click();
  await page.getByRole("button", { name: "Add lead", exact: true }).click();
  await page
    .getByLabel("Name", { exact: true })
    .fill("Acceptance agency owner");
  await page.getByLabel("Company / agency").fill("Acceptance Agency");
  await page.getByLabel("Contact details").fill("Owner-provided contact");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add lead", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Acceptance agency owner", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Acceptance agency owner", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Stage", { exact: true }).selectOption("qualified");
  await page.getByRole("button", { name: "Save lead" }).click();
  await page.reload();
  await expect(
    page.locator("tbody tr").filter({ hasText: "Acceptance agency owner" }),
  ).toContainText("qualified");
  await page.getByRole("link", { name: "Finance", exact: true }).click();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("1200.50");
  await page.getByLabel("Category", { exact: true }).fill("Acceptance hosting");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(
    page.getByText("Acceptance hosting", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Acceptance hosting" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("1250.25");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await page.reload();
  await expect(page.locator("tbody")).toContainText("1250.25");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Type", { exact: true }).selectOption("income");
  await page.getByLabel("Amount", { exact: true }).fill("30.00");
  await page.getByLabel("Currency", { exact: true }).selectOption("USD");
  await page
    .getByLabel("Category", { exact: true })
    .fill("Acceptance USD income");
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.locator(".currency-card")).toHaveCount(2);
  const blocked = await page.request.post("/api/tasks", {
    headers: { Origin: "https://untrusted.example" },
    data: { title: "Blocked origin", worker_id: "script_writer" },
  });
  expect(blocked.status()).toBe(403);
});
test("current-Codex reporting, seven-script draft review and offline outbox work end to end", async ({
  page,
}) => {
  await signIn(page);
  const task = cli([
    "create",
    "--title",
    "Acceptance weekly scripts",
    "--worker",
    "script_writer",
  ]);
  const run = cli(["start", "--task", task.id]);
  cli([
    "event",
    "--run",
    run.id,
    "--type",
    "step.started",
    "--step",
    "audience",
    "--message",
    "Reviewing the owner-provided agency brief",
  ]);
  await page.goto("/tasks/" + task.id);
  await expect(page.getByRole("dialog")).toBeVisible();
  cli([
    "event",
    "--run",
    run.id,
    "--type",
    "step.completed",
    "--step",
    "audience",
    "--message",
    "Audience research finished while the drawer stayed open",
  ]);
  await expect(
    page
      .getByRole("dialog")
      .getByText("Audience research finished while the drawer stayed open", {
        exact: true,
      }),
  ).toBeVisible({ timeout: 12000 });
  const audience = "Myanmar study-abroad agency owners";
  const draft = {
    schema_version: 1,
    campaign_name: "Acceptance agency operations",
    target_audience: audience,
    week: "Week 1",
    overview: "Acceptance fixture only. No generated marketing claims.",
    research: "Test fixture; not market research.",
    review_notes: "Owner review required.",
    scripts: Array.from({ length: 7 }, (_, i) => ({
      script_id: `day-${i + 1}`,
      day: i + 1,
      category: i % 2 === 0 ? "educational" : "demo_or_proof",
      title: `Acceptance script ${i + 1}`,
      target_audience: audience,
      language: "my",
      estimated_duration_seconds: 45,
      hook_options: ["အလုပ်ကို ပိုလွယ်အောင် လုပ်ကြမယ်", "Hook B", "Hook C"],
      selected_hook: "အလုပ်ကို ပိုလွယ်အောင် လုပ်ကြမယ်",
      body_sections: [
        {
          type: "insight",
          voiceover: "ဒါက စမ်းသပ်ဖို့ ပြုလုပ်ထားတဲ့ script ဖြစ်ပါတယ်။",
          visual_direction: "Owner-supplied software only.",
        },
      ],
      cta: "Review this draft.",
      overlay_text: [],
      editor_notes: "Acceptance fixture.",
      claim_sources: [],
    })),
  };
  const response = await page.request.post("/api/internal/packages", {
    headers: { Authorization: `Bearer ${process.env.FACTORY_BRIDGE_TOKEN}` },
    data: {
      task_id: task.id,
      run_id: run.id,
      producer_id: run.producer_id,
      package: draft,
    },
  });
  expect(response.status()).toBe(201);
  cli([
    "event",
    "--run",
    run.id,
    "--type",
    "run.completed",
    "--message",
    "Weekly draft exported for review",
  ]);
  await page.goto("/tasks/" + task.id);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".script-item")).toHaveCount(7);
  await page.locator(".script-item").first().locator("summary").click();
  await expect(
    page
      .locator(".script-item")
      .first()
      .getByText("ဒါက စမ်းသပ်ဖို့ ပြုလုပ်ထားတဲ့ script ဖြစ်ပါတယ်။", {
        exact: true,
      }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve this revision" }).click();
  await expect(page.locator(".task-meta")).toContainText("Completed");
  const revisionRun = cli(["start", "--task", task.id]);
  const staleImport = await page.request.post("/api/internal/packages", {
    headers: { Authorization: `Bearer ${process.env.FACTORY_BRIDGE_TOKEN}` },
    data: {
      task_id: task.id,
      run_id: run.id,
      producer_id: run.producer_id,
      package: { ...draft, overview: "Late old attempt" },
    },
  });
  expect(staleImport.status()).toBe(409);
  const revised = await page.request.post("/api/internal/packages", {
    headers: { Authorization: `Bearer ${process.env.FACTORY_BRIDGE_TOKEN}` },
    data: {
      task_id: task.id,
      run_id: revisionRun.id,
      producer_id: revisionRun.producer_id,
      package: {
        ...draft,
        overview: "Changed revision requires a fresh review.",
      },
    },
  });
  expect(revised.status()).toBe(201);
  await page.reload();
  await expect(page.locator(".task-meta")).toContainText("Needs review");
  const rejected = await page.request.post(
    "/api/artifacts/" + (await revised.json()).id + "/review",
    {
      headers: {
        Authorization: `Bearer ${process.env.FACTORY_BRIDGE_TOKEN}`,
        Origin: "http://localhost:3000",
      },
      data: { decision: "approved", sha256: "f".repeat(64) },
    },
  );
  expect(rejected.status()).not.toBe(200);
  const queue = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "scripts/factory.mjs",
        "event",
        "--run",
        run.id,
        "--type",
        "worker.heartbeat",
        "--message",
        "Reporter test",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          FACTORY_URL: "http://localhost:39998",
          FACTORY_STATE_DIR: ".data/acceptance-bridge",
        },
      },
    ),
  );
  expect(queue.queued).toBe(true);
  expect(cli(["flush"]).delivered).toBeGreaterThanOrEqual(1);
});
test("mobile office stays contained and reduced motion preserves usable navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Lead Tracker", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Every conversation counts." }),
  ).toBeVisible();
  await page.screenshot({ path: ".data/factory-mobile.png", fullPage: true });
});

test("older records stay searchable, reachable and present in exports", async ({
  page,
}) => {
  await signIn(page);
  const options = {
    headers: { Origin: "http://localhost:3000" },
    data: { title: "Oldest acceptance record", worker_id: "script_writer" },
  };
  expect((await page.request.post("/api/tasks", options)).status()).toBe(201);
  for (let batch = 0; batch < 21; batch++) {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        page.request.post("/api/tasks", {
          headers: { Origin: "http://localhost:3000" },
          data: {
            title: `Archive acceptance ${batch * 10 + i}`,
            worker_id: "script_writer",
          },
        }),
      ),
    );
    for (const result of results) expect(result.status()).toBe(201);
  }
  await page.goto("/tasks");
  await expect(
    page.getByRole("button", { name: "Load older records" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search tasks" })
    .fill("Oldest acceptance record");
  await expect(
    page.getByRole("button", { name: "Oldest acceptance record", exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search tasks" }).fill("");
  await page.getByRole("button", { name: "Load older records" }).click();
  await expect(
    page.getByRole("button", { name: "Oldest acceptance record", exact: true }),
  ).toBeVisible();
  const exported = await page.request.get("/api/export");
  expect(exported.status()).toBe(200);
  expect((await exported.json()).tasks.length).toBeGreaterThan(210);
});
