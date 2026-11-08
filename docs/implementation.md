# Marketing Factory V1 implementation ledger

Source: ../MARKETING_FACTORY_V1_ARCHITECTURE.md and approved conversation plan.

## Confirmed decisions

- Manual commands in the current Codex app. Reporting CLI, not a task-launching wrapper.
- Myanmar study-abroad agency owners; seven Burmese scripts, four education + three demonstrations.
- Password-only owner login; no signup. New isolated marketing_factory schema.
- Existing standalone video engine remains unchanged. Heavy media processing stays on Railway.
- Drafts are durably reviewable before revision-specific approval. Google Drive delivery is required for finished video tasks.
- Replaceable placeholder characters. No design approval checkpoint needed for final character artwork in this build.

## Execution

- [x] Foundation, persistent database, authentication, task/event contracts.
- [x] Pixel dashboard and manual task, CRM, Finance workflows.
- [x] Script package import/review and local reporting CLI with durable outbox.
- [x] Existing video adapter, resumable Drive delivery and reconciliation worker.
- [x] Automated tests, production build, browser acceptance, independent review.

## Rulings

- New project directory is the isolated workspace; initialize its own feature branch rather than altering another product's repository.
- Local development uses an isolated persistent PGlite database when DATABASE_URL is absent. Production requires Neon unless explicit local acceptance mode is enabled. This permits meaningful database and browser tests without selecting another product's database.
- Hosting target/budget and Google OAuth credentials are configuration dependencies. Finish all local implementation and acceptance before provisioning external services.

## Interfaces

- Owner session protects business reads/writes and approvals.
- Scoped bridge token registers tasks/runs, ingests events and uploads script packages, without business-record or approval access.
- Events are immutable, deduplicated by event_id and ordered per producer; remote engine state is authoritative for remote steps.
- Delivery jobs own leases/retries and never resubmit renders.

## Local acceptance evidence

- 36 automated tests passed across seven files, including stale approvals, run identity, terminal event replay, exhausted delivery leases, lost final upload responses, remote heartbeat authority and history beyond 200 records.
- Five Chrome browser workflows passed against the production standalone bundle: private routes/bridge scope; CRM/Finance persistence and currency separation; writer reporting, seven Burmese scripts, live drawer updates, exact revision approval and offline replay; mobile containment/reduced motion; older history/search/full export.
- Production build, TypeScript check and ESLint passed. Production dependency audit reported zero vulnerabilities. Both reporting skills passed the skill validator.
- Migration and worker entrypoints were smoke-tested locally. Standalone output excludes local credentials and database files.

## Independent review disposition

The fresh reviewer reported no Critical findings. All eight Important findings were addressed: executable worker/migration startup; current approval checks during delivery; recovery from an exhausted expired lease; remote state authority; current-run artifact approval; producer identity on package imports; artifact requirements on manual completion; and complete history/export access.

Three additional findings were treated as Important because they affect monitoring or delivery quality: transfers no longer block engine observation, open task drawers refresh automatically, and final video admission requires explicit decode/media-contract QA passes. Regression coverage accompanies these changes.

## External acceptance still required

No cloud deployment, paid render or Google authorization was performed. Actual Neon/Railway/Drive acceptance awaits the owner's database choice, hosting budget and Google OAuth configuration. Docker image execution is unverified because the local Docker daemon is unavailable. Real PostgreSQL multi-process lease contention and human review of actual Burmese scripts, video and audio remain live acceptance work.

Ruling: Cloud drafts use private object storage; the isolated local development database keeps draft JSON itself to enable credential-free acceptance. Production Neon contains only artifact metadata and approval decisions.
Ruling: Password login crosses a full-document navigation boundary to discard unauthenticated Next.js route caches. The local browser tests caught a stale-route loop from soft navigation.
