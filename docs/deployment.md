# Deploy on Railway

Create a dedicated Neon project or select the owner-designated existing database. Never choose another product's database implicitly. Migrations create only the `marketing_factory` schema. Keep a Neon recovery point and test restores before relying on it for business history.

## Configure credentials

Use `.env.example`. The web service needs DATABASE_URL, APP_URL, AUTH_SECRET, OWNER_PASSWORD_HASH, FACTORY_BRIDGE_TOKEN and TOKEN_ENCRYPTION_KEY. AUTH_SECRET must be at least 32 random characters; TOKEN_ENCRYPTION_KEY is 32 random bytes encoded as 64 hex characters. OWNER_PASSWORD_HASH accepts an Argon2id encoded hash or its base64 encoding; base64 avoids `$` expansion in local Next.js dotenv files.

Generate a password hash without putting a password in shell history:

```sh
npm run owner:password
```

The command prompts privately and writes a hash file under `.data/`. Copy only that hash to the Railway variable. The initial `.data/local-login.txt` password belongs only to local development.

Add existing bucket credentials privately to the web and delivery services. Web writes only `marketing-factory/v1/` script objects and reads its drafts. Delivery reads registered artifacts under VIDEO_STORAGE_PREFIX (default `personal-video/v1`) and needs no Railway API token. Prefer bucket permissions restricted to those namespaces where supported.

Use a Google Cloud OAuth **Web application** client. Add `APP_URL/api/integrations/google/callback` as an exact redirect URI. Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on web and delivery; keep the same TOKEN_ENCRYPTION_KEY. From Settings, connect the owner's account with offline Drive file access. A consent app left in Google's Testing mode can have expiring refresh tokens; configure its publishing status appropriately before unattended use. Revocation always requires reconnection.

## Build and deploy

Two services use this directory:

1. Web: `Dockerfile`, start `node server.js`, public HTTPS domain. Set APP_URL to that domain.
2. Delivery: `Dockerfile.worker`, no public domain or web health check. Start is provided in the image. Keep one replica for V1.

Set `RAILWAY_DOCKERFILE_PATH=Dockerfile.worker` on the delivery service. Set the web service healthcheck to `/api/ready`; leave the worker healthcheck unset because it has no HTTP listener. These settings follow the [Railway Dockerfile guide](https://docs.railway.com/builds/dockerfiles) and [healthcheck guide](https://docs.railway.com/deployments/healthchecks).

Run `npm run db:migrate` in a controlled release environment using the intended DATABASE_URL. It uses a PostgreSQL advisory lock and does not touch unrelated schemas. Confirm the four worker rows, then verify login, authenticated API access and persistence after redeployment. Do not enable local database mode on Railway.

The web process does not run production migrations automatically. Host credentials and media-job budget approval must be configured separately. A hosting budget is not a per-job render allowance.

Include both always-on services and database compute in the hosting budget: the worker's polling can keep Neon compute awake. Rotating AUTH_SECRET invalidates existing owner sessions; use this when replacing development credentials with production credentials.

## Local reporting and live acceptance

Point FACTORY_URL at the deployed HTTPS origin and use the matching bridge token. Run `npm run factory -- help`. Register a small writer task, upload a real draft, and approve its exact revision. Then attach an owner-authorized final render from the existing editor. Confirm recorded remote stages, QA evidence, private Drive upload and its byte/checksum verification.

A live success claim requires those actual checks; unit and browser fixtures do not prove Google, Neon or Railway integration.
