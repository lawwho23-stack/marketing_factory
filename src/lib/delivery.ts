import { sql } from "drizzle-orm";
import { type FactoryDb } from "./database";
import { AppError, type Artifact } from "./store";
import {
  DriveClient,
  driveAccessToken,
  ensureDriveRoot,
  uploadedOffset,
} from "./google";
import { inspectObject, readRange } from "./storage";
export interface DeliveryJob {
  id: string;
  artifact_id: string;
  status: string;
  attempts: number;
  lease_owner: string;
  drive_file_id: string | null;
  upload_url: string | null;
  uploaded_bytes: number;
}
export async function claimDelivery(db: FactoryDb, owner: string) {
  return db.transaction(async (tx) => {
    await tx.query(
      sql`UPDATE marketing_factory.delivery_jobs SET status='failed',error='The final delivery attempt was interrupted. Retry delivery to resume the saved transfer.',lease_until=NULL,lease_owner=NULL,updated_at=now() WHERE status='uploading' AND attempts>=5 AND lease_until<now()`,
    );
    const [job] = await tx.query<DeliveryJob>(
      sql`SELECT * FROM marketing_factory.delivery_jobs WHERE status IN ('pending','uploading') AND attempts<5 AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    if (!job) return null;
    const [claimed] = await tx.query<DeliveryJob>(
      sql`UPDATE marketing_factory.delivery_jobs SET lease_owner=${owner},lease_until=now()+interval '5 minutes',status='uploading',attempts=attempts+1,updated_at=now() WHERE id=${job.id} RETURNING *`,
    );
    return claimed;
  });
}
export function verifiedDriveFile(
  file: {
    size?: string;
    md5Checksum?: string;
    parents?: string[];
    trashed?: boolean;
  },
  bytes: number,
  md5: string,
  parent: string,
) {
  return (
    !file.trashed &&
    Number(file.size) === bytes &&
    file.md5Checksum === md5 &&
    !!file.parents?.includes(parent)
  );
}
async function updateLease(
  db: FactoryDb,
  job: DeliveryJob,
  uploadUrl: string | null,
  offset: number,
  fileId: string | null,
) {
  const rows = await db.query(
    sql`UPDATE marketing_factory.delivery_jobs SET upload_url=${uploadUrl},uploaded_bytes=${offset},drive_file_id=${fileId},lease_until=now()+interval '5 minutes',updated_at=now() WHERE id=${job.id} AND lease_owner=${job.lease_owner} AND status='uploading' RETURNING id`,
  );
  if (!rows.length)
    throw new AppError(
      "Delivery lease changed. This worker stopped safely.",
      409,
    );
}
export interface DeliveryDependencies {
  inspect: typeof inspectObject;
  range: typeof readRange;
  accessToken: typeof driveAccessToken;
  createDrive: (token: string) => DriveClient;
  root: typeof ensureDriveRoot;
}
const defaults: DeliveryDependencies = {
  inspect: inspectObject,
  range: readRange,
  accessToken: driveAccessToken,
  createDrive: (token) => new DriveClient(token),
  root: ensureDriveRoot,
};
export async function deliver(
  db: FactoryDb,
  job: DeliveryJob,
  dependencies: DeliveryDependencies = defaults,
) {
  let renewTimer: ReturnType<typeof setInterval> | undefined;
  try {
    const [artifact] = await db.query<Artifact>(
      sql`SELECT * FROM marketing_factory.artifacts WHERE id=${job.artifact_id}`,
    );
    if (!artifact?.storage_key) throw new Error("Delivery source is missing.");
    renewTimer = setInterval(() => {
      void db
        .query(
          sql`UPDATE marketing_factory.delivery_jobs SET lease_until=now()+interval '5 minutes' WHERE id=${job.id} AND lease_owner=${job.lease_owner} AND status='uploading'`,
        )
        .catch(() => {});
    }, 60000);
    const hashes = await dependencies.inspect(
      artifact.storage_key,
      Number(artifact.bytes),
    );
    if (hashes.sha256 !== artifact.sha256)
      throw new Error("Artifact checksum failed before delivery.");
    const drive = dependencies.createDrive(await dependencies.accessToken(db));
    const root = await dependencies.root(db, drive);
    const fileId = job.drive_file_id ?? (await drive.newFileId());
    await updateLease(
      db,
      job,
      job.upload_url,
      Number(job.uploaded_bytes),
      fileId,
    );
    // Reuse the same file ID even after a lost success response or expired upload session.
    let file = await drive.file(fileId).catch((error) => {
      if (error instanceof AppError && error.message.includes("(404)"))
        return null;
      throw error;
    });
    let url = job.upload_url;
    let offset = 0;
    const total = Number(artifact.bytes);
    if (!file) {
      if (url) {
        const status = await drive.uploadStatus(url, total);
        if (status.ok) file = await status.json();
        else if (status.status === 308) offset = uploadedOffset(status);
        else if ([404, 410].includes(status.status)) url = null;
        else throw new AppError("Unable to resume Drive upload.", 502);
      }
      if (!file && !url) {
        url = await drive.startUpload(
          fileId,
          `${artifact.task_id.slice(0, 8)}-${artifact.sha256.slice(0, 10)}-${artifact.title}`,
          root,
          total,
          artifact.type === "video" ? "video/mp4" : "application/octet-stream",
        );
        await updateLease(db, job, url, 0, fileId);
        if (!url) file = await drive.file(fileId);
      }
      while (!file && offset < total) {
        if (!url) throw new Error("No resumable upload session.");
        if (offset < 0 || offset > total)
          throw new Error("Invalid resumable upload offset.");
        const end = Math.min(total, offset + 8 * 1024 * 1024) - 1;
        const bytes = await dependencies.range(
          artifact.storage_key,
          offset,
          end,
        );
        const result = await drive.uploadChunk(url, bytes, offset, total);
        if (result.ok) {
          file = await result.json();
          offset = total;
        } else if (result.status === 308) {
          const next = uploadedOffset(result);
          if (next <= offset || next > total)
            throw new Error("Upload did not make valid progress.");
          offset = next;
        } else if ([401, 403].includes(result.status))
          throw new AppError(
            "Reconnect Drive or check its available storage.",
            428,
          );
        else
          throw new AppError(`Drive transfer failed (${result.status}).`, 502);
        await updateLease(db, job, url, offset, fileId);
      }
    }
    file = await drive.file(fileId);
    if (!verifiedDriveFile(file, total, hashes.md5, root))
      throw new Error(
        "Drive file failed byte, checksum or destination verification.",
      );
    await db.transaction(async (tx) => {
      await tx.query(
        sql`SELECT id FROM marketing_factory.tasks WHERE id=${artifact.task_id} FOR UPDATE`,
      );
      const rows = await tx.query(
        sql`UPDATE marketing_factory.delivery_jobs SET status='delivered',uploaded_bytes=${total},upload_url=NULL,error=NULL,lease_until=NULL,lease_owner=NULL,updated_at=now() WHERE id=${job.id} AND lease_owner=${job.lease_owner} RETURNING id`,
      );
      if (!rows.length)
        throw new Error("Delivery lease changed before completion.");
      await tx.query(
        sql`UPDATE marketing_factory.artifacts SET drive_file_id=${fileId},drive_url=${`https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`} WHERE id=${artifact.id}`,
      );
      if (artifact.type === "video")
        await tx.query(
          sql`UPDATE marketing_factory.tasks SET status='completed',updated_at=now() WHERE id=${artifact.task_id} AND current_run_id IS NOT DISTINCT FROM ${artifact.run_id}::uuid AND EXISTS(SELECT 1 FROM marketing_factory.artifacts current_artifact WHERE current_artifact.id=${artifact.id} AND current_artifact.review_status='approved') AND NOT EXISTS(SELECT 1 FROM marketing_factory.artifacts newer WHERE newer.task_id=${artifact.task_id} AND newer.type='video' AND (newer.created_at>${artifact.created_at}::timestamptz OR (newer.created_at=${artifact.created_at}::timestamptz AND newer.id>${artifact.id}::uuid)))`,
        );
    });
  } catch (error) {
    const needsReconnect = error instanceof AppError && error.status === 428;
    const terminal = job.attempts >= 5;
    const message = needsReconnect
      ? "Reconnect Google Drive in Settings."
      : error instanceof Error &&
          /checksum|byte|destination|source|manifest|size/.test(error.message)
        ? "Artifact verification failed. Inspect the source and manifest."
        : "Delivery was interrupted. The saved video is retained; retry resumes delivery only.";
    await db.query(
      sql`UPDATE marketing_factory.delivery_jobs SET status=${needsReconnect ? "needs_reconnect" : terminal ? "failed" : "pending"},error=${message},lease_until=NULL,lease_owner=NULL,next_attempt_at=${new Date(Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts))},updated_at=now() WHERE id=${job.id} AND lease_owner=${job.lease_owner}`,
    );
  } finally {
    if (renewTimer) clearInterval(renewTimer);
  }
}
