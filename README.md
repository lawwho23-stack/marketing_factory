# Marketing Factory

A private pixel-office dashboard for manually directed Codex work. Four desks: Script Writer, existing Video Editor, Lead Tracker and Finance. Character artwork is replaceable CSS, separate from task state.

## Run locally

Requires Node 22.12 or newer.

```sh
npm ci
npm run setup:local
npm run dev
```

Open **http://localhost:3000**. The development owner password is in **`.data/local-login.txt`**, a private ignored file. The setup command never prints secrets and does not overwrite existing configuration. Local records persist in `.data/postgres` using PGlite. Only the web process should open that local directory.

To run the production bundle locally:

```sh
npm run build
npm start
```

For your own password, run `npm run owner:password`; set OWNER_PASSWORD_HASH from the generated private hash file and restart. Rotate the development credentials before deployment.

## Use the factory

1. Create a campaign if useful, then plan a task in the dashboard.
2. Ask the current Codex app to use `$marketing-factory-script-writer` with the task ID. The skill creates the weekly draft and reports actual stages.
3. Review the package in the dashboard. Approval applies to that exact revision. Download JSON or Markdown, then record narration yourself.
4. For video, use `$marketing-factory-video-monitor` alongside the existing `video-edit-pipeline` skill. The adapter attaches a final Railway render ID; it never replaces or launches the editor automatically.
5. The remote worker observes the existing render, retains QA evidence, and transfers verified outputs to private Google Drive. Delivery retries never rerender.
6. Maintain leads and income/expenses manually. Currency totals remain separate.

Reporter help:

```sh
npm run factory -- help
```

The CLI uses FACTORY_URL (or APP_URL) and FACTORY_BRIDGE_TOKEN privately from environment or `.env.local`. Its durable event outbox is in `.data/bridge`. It does not monitor unrelated conversations, expose terminal output, launch another Codex process or approve for the owner.

## Verify

```sh
npm test
npm run typecheck
npm run lint
npm run test:e2e
```

Browser tests use an isolated local database and installed Google Chrome. They exercise authentication boundaries, current-Codex reporting, script revision approval, offline replay, CRM/Finance persistence and mobile navigation. They do not spend on media processing or claim live provider acceptance.

## Railway, Neon and Drive

See [deployment instructions](docs/deployment.md) and [implemented architecture](docs/architecture.md). The application requires the selected Neon connection, runtime secrets, existing bucket access, and Google OAuth configuration before cloud acceptance. Use `Dockerfile` for the web service and `Dockerfile.worker` for the separate delivery service.

Run `npm run db:migrate` with the intended DATABASE_URL before starting production. It creates only `marketing_factory`. The web app does not apply production migrations automatically. The separate worker requires PostgreSQL and must not share the local PGlite directory.

Google Drive OAuth authorization is separate from owner password login. Connect it from Settings after configuring the OAuth web client and exact callback URL. Keep artifacts private; the application never posts to social platforms.

Deployment and a real render/upload test need the owner's configured hosting budget and a separate approved render budget. The source build, local acceptance, cloud configuration and live output verification are distinct milestones.
