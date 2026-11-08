import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { AppError } from "./store";
export function storage() {
  const {
    S3_ENDPOINT: endpoint,
    S3_REGION: region = "auto",
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
    S3_BUCKET: bucket,
  } = process.env;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket)
    throw new AppError(
      "Configure the existing video artifact bucket on the delivery worker.",
      503,
    );
  return {
    client: new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    }),
    bucket,
  };
}
export async function readObject(key: string, maximum = 2 * 1024 * 1024) {
  const { client, bucket } = storage();
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!result.Body || Number(result.ContentLength) > maximum)
    throw new Error("Artifact manifest exceeds its allowed size.");
  const bytes = await result.Body.transformToByteArray();
  if (bytes.length > maximum)
    throw new Error("Artifact manifest exceeds its allowed size.");
  return bytes;
}
export async function writePackageObject(
  taskId: string,
  sha256: string,
  body: string,
) {
  const { client, bucket } = storage();
  const key = `marketing-factory/v1/tasks/${taskId}/scripts/${sha256}.json`;
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
        IfNoneMatch: "*",
      }),
    );
  } catch (error) {
    if (
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode !== 412
    )
      throw error;
    const existing = await readObject(key);
    if (createHash("sha256").update(existing).digest("hex") !== sha256)
      throw new Error("Stored draft checksum mismatch.");
  }
  return key;
}
export async function readRange(key: string, start: number, end: number) {
  const { client, bucket } = storage();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: `bytes=${start}-${end}`,
    }),
  );
  if (!result.Body) throw new Error("Artifact has no content.");
  const bytes = await result.Body.transformToByteArray();
  if (bytes.length !== end - start + 1)
    throw new Error("Artifact range has an unexpected size.");
  return bytes;
}
export async function inspectObject(key: string, expectedBytes: number) {
  const { client, bucket } = storage();
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!result.Body || Number(result.ContentLength) !== expectedBytes)
    throw new Error("Artifact byte count does not match the manifest.");
  const sha = createHash("sha256"),
    md5 = createHash("md5");
  let size = 0;
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    sha.update(chunk);
    md5.update(chunk);
    if (size > expectedBytes)
      throw new Error("Artifact exceeds expected size.");
  }
  if (size !== expectedBytes)
    throw new Error("Artifact download is incomplete.");
  return { sha256: sha.digest("hex"), md5: md5.digest("hex"), size };
}
