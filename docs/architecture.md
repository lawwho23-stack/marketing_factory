# Marketing Factory V1 — implemented architecture

The source brief is `../MARKETING_FACTORY_V1_ARCHITECTURE.md` in the parent workspace. These decisions supersede its student-focused examples and CLI launcher design.

## Boundaries

The owner manually instructs the current Codex app. Factory skills call a reporting CLI; no web endpoint starts an agent, executes shell commands or dispatches a render. The dashboard represents four workspaces and derives activity from actual records.

The Script Writer serves Myanmar study-abroad agency owners buying the owner's AI/software services. Its default is seven Burmese scripts, four education and three real demonstrations. The orchestration skill documents real stages and can use a separate quality-review specialist. It never approves for the owner.

The existing standalone personal video engine remains unchanged. Its final Railway render ID is attached to a factory run. The reconciliation worker reads only registered job keys under the configured private namespace. Existing engine claims and resource protections still govern processing.

## Data and output

- Neon PostgreSQL stores records in `marketing_factory`; Drizzle parameterized SQL compiles every application query.
- Local development uses a separate persistent PGlite database. Only one web process may own that local directory. Tests use isolated databases; the separate worker requires a PostgreSQL connection.
- Cloud script drafts live as immutable checksum-addressed JSON in private object storage. Neon stores their metadata and owner decisions. Local acceptance stores modest draft JSON in its local database so the UI is testable without external credentials.
- Video binaries and QA sidecars remain in the existing bucket until the delivery worker saves verified copies to the owner's private Drive. The application does not delete source artifacts.
- The owner reviews a specific artifact hash. Edits create a new revision. QA sidecars cannot complete a video task. A video task needs the latest approved video plus verified Drive delivery.

## Monitoring and recovery

Task, run, event, editorial review and delivery status are independent. Local reporter outboxes retain only event metadata. Source producer/sequence and immutable event IDs stop replayed or late observations from reversing state. A terminal old run cannot replace a current attempt.

The visible dashboard polls every five seconds and slows to 30 seconds when hidden. The delivery worker reconciles known active engine runs every 15 seconds. Freshness expires after 90 seconds; a bridge heartbeat says nothing about unobserved model execution. Stale activity is not silently marked completed or failed.

Delivery jobs lease ownership, persist the Drive file ID and resumable session, verify source SHA-256 and remote byte count/MD5, and retry at most five times before requiring intervention. A lost final response reuses the same file ID. Delivery does not invoke the editor. OAuth refresh tokens use AES-256-GCM encryption at rest.

## Access

Owner password authentication uses Argon2id and sealed HttpOnly cookies referencing revocable database sessions. Mutations require the configured same origin; there is no public signup. A separate bridge token registers work and reports events/packages but cannot read business records or approve outputs.

Secrets are runtime variables, never NEXT_PUBLIC values. Google Drive access is a separate OAuth grant limited to app-created files. The local bootstrap password is development-only and is saved in an ignored mode-0600 file, never printed to command output.

## Delivery state

The source implementation and local acceptance are separate from cloud deployment. A configured Railway service, Neon migration, connected Google account, real remote render and independently checked Drive output are required before claiming live production acceptance.
