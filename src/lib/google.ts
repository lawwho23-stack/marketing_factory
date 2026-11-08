import { sql } from "drizzle-orm";
import { type DbSession } from "./database";
import { AppError } from "./store";
import { encryptSecret, decryptSecret } from "./security";
function config() {
  const {
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: clientSecret,
    APP_URL,
    TOKEN_ENCRYPTION_KEY: key,
  } = process.env;
  if (!clientId || !clientSecret || !APP_URL || !key)
    throw new AppError(
      "Configure Google client ID, client secret, APP_URL and token encryption key first.",
      503,
    );
  return {
    clientId,
    clientSecret,
    key,
    redirect: new URL("/api/integrations/google/callback", APP_URL).href,
  };
}
export function googleConnectUrl(state: string) {
  const c = config();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirect,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return url.href;
}
export async function finishGoogleConnect(db: DbSession, code: string) {
  const c = config();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirect,
      code,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new AppError("Google authorization failed. Reconnect Drive.");
  const body = await response.json();
  if (!body.refresh_token)
    throw new AppError(
      "Google did not grant offline access. Reconnect and allow Drive access.",
    );
  const [previous] = await db.query<{ value_json: Record<string, unknown> }>(
    sql`SELECT value_json FROM marketing_factory.integrations WHERE id='google_drive'`,
  );
  const value = {
    ...previous?.value_json,
    refresh_token: encryptSecret(body.refresh_token, c.key),
    connected_at: new Date().toISOString(),
  };
  await db.query(
    sql`INSERT INTO marketing_factory.integrations(id,value_json) VALUES('google_drive',${JSON.stringify(value)}::jsonb) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,updated_at=now()`,
  );
}
export async function driveAccessToken(db: DbSession) {
  const c = config();
  const [row] = await db.query<{ value_json: Record<string, string> }>(
    sql`SELECT value_json FROM marketing_factory.integrations WHERE id='google_drive'`,
  );
  if (!row?.value_json.refresh_token)
    throw new AppError("Connect Google Drive in Settings.", 428);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: decryptSecret(row.value_json.refresh_token, c.key),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new AppError(
      "Google access expired or was revoked. Reconnect Drive.",
      428,
    );
  return (await response.json()).access_token as string;
}
export class DriveClient {
  constructor(
    private token: string,
    private transport: typeof fetch = fetch,
  ) {}
  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.token}`, ...extra };
  }
  async request(path: string, options: RequestInit = {}) {
    const response = await this.transport(
      `https://www.googleapis.com/drive/v3/${path}`,
      {
        ...options,
        headers: { ...this.headers(), ...options.headers },
        signal: AbortSignal.timeout(60000),
      },
    );
    if (response.status === 401 || response.status === 403)
      throw new AppError(
        "Drive access needs attention. Reconnect or check available storage.",
        428,
      );
    if (!response.ok)
      throw new AppError(`Drive request failed (${response.status}).`, 502);
    return response.json();
  }
  async file(id: string) {
    return this.request(
      `files/${encodeURIComponent(id)}?fields=id,name,size,md5Checksum,webViewLink,parents,trashed`,
    );
  }
  async newFileId() {
    return (await this.request("files/generateIds?count=1&space=drive"))
      .ids[0] as string;
  }
  async createFolder(id: string, name: string, parent?: string) {
    try {
      return await this.request("files?fields=id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name,
          mimeType: "application/vnd.google-apps.folder",
          ...(parent ? { parents: [parent] } : {}),
        }),
      });
    } catch (error) {
      const existing = await this.file(id).catch(() => null);
      if (existing && !existing.trashed) return existing;
      throw error;
    }
  }
  async startUpload(
    id: string,
    name: string,
    parent: string,
    total: number,
    mimeType: string,
  ) {
    const response = await this.transport(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,md5Checksum,webViewLink",
      {
        method: "POST",
        headers: this.headers({
          "Content-Type": "application/json",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(total),
        }),
        body: JSON.stringify({ id, name, parents: [parent] }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (response.status === 409) return null;
    if (response.status === 401 || response.status === 403)
      throw new AppError("Reconnect Drive or check available storage.", 428);
    if (!response.ok)
      throw new AppError(
        `Unable to begin Drive upload (${response.status}).`,
        502,
      );
    const location = response.headers.get("location");
    if (!location || !validUploadUrl(location))
      throw new AppError("Drive returned an invalid upload address.", 502);
    return location;
  }
  async uploadStatus(url: string, total: number) {
    return this.uploadRequest(url, new Uint8Array(), `bytes */${total}`);
  }
  async uploadChunk(
    url: string,
    body: Uint8Array,
    start: number,
    total: number,
  ) {
    return this.uploadRequest(
      url,
      body,
      `bytes ${start}-${start + body.byteLength - 1}/${total}`,
    );
  }
  private async uploadRequest(url: string, body: Uint8Array, range: string) {
    if (!validUploadUrl(url))
      throw new AppError("Invalid saved Drive upload address.");
    return this.transport(url, {
      method: "PUT",
      headers: this.headers({
        "Content-Range": range,
        "Content-Length": String(body.byteLength),
      }),
      body: body as BodyInit,
      signal: AbortSignal.timeout(120000),
      redirect: "error",
    });
  }
}
export function validUploadUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.origin === "https://www.googleapis.com" &&
      url.pathname.startsWith("/upload/drive/")
    );
  } catch {
    return false;
  }
}
export function uploadedOffset(response: Response) {
  if (response.status !== 308)
    throw new Error("Expected an incomplete upload response.");
  const range = response.headers.get("range");
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  if (!match) throw new Error("Invalid Drive progress response.");
  return Number(match[1]) + 1;
}
export async function ensureDriveRoot(db: DbSession, drive: DriveClient) {
  const [row] = await db.query<{ value_json: Record<string, string> }>(
    sql`SELECT value_json FROM marketing_factory.integrations WHERE id='google_drive'`,
  );
  if (!row) throw new AppError("Connect Drive first.", 428);
  const root = row.value_json.root_id ?? (await drive.newFileId());
  if (!row.value_json.root_id)
    await db.query(
      sql`UPDATE marketing_factory.integrations SET value_json=value_json || ${JSON.stringify({ root_id: root })}::jsonb WHERE id='google_drive'`,
    );
  await drive.createFolder(root, "Marketing Factory");
  return root;
}
