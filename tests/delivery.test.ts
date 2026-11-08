import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDatabase, type FactoryDb } from "../src/lib/database";
import { createTask, reviewArtifact } from "../src/lib/store";
import {
  claimDelivery,
  verifiedDriveFile,
  deliver,
  type DeliveryDependencies,
} from "../src/lib/delivery";
import { uploadedOffset, validUploadUrl, DriveClient } from "../src/lib/google";
let db: FactoryDb;
beforeAll(async () => {
  db = await createDatabase();
}, 30000);
afterAll(async () => db.close());
describe("delivery recovery", () => {
  it.each(["approved", "rejected"] as const)(
    "uses the latest owner decision when it changes to %s during a transfer",
    async (decision) => {
      const task = await createTask(db, {
        title: "Approval changed during delivery " + decision,
        worker_id: "video_editor",
        description: "",
      });
      const artifact = randomUUID(),
        job = randomUUID();
      await db.query(
        sql`INSERT INTO marketing_factory.artifacts(id,task_id,title,type,sha256,bytes,storage_key,review_status) VALUES(${artifact},${task.id},'video.mp4','video',${"d".repeat(64)},10,'private-race-key',${decision === "approved" ? "needs_review" : "approved"})`,
      );
      await db.query(
        sql`INSERT INTO marketing_factory.delivery_jobs(id,artifact_id,drive_file_id) VALUES(${job},${artifact},'existing-race-file')`,
      );
      await db.query(
        sql`UPDATE marketing_factory.delivery_jobs SET status='delivered' WHERE id<>${job}`,
      );
      const transport: typeof fetch = async () =>
        Response.json({
          id: "existing-race-file",
          size: "10",
          md5Checksum: "verified",
          parents: ["root"],
          trashed: false,
        });
      const dependencies: DeliveryDependencies = {
        inspect: async () => {
          await reviewArtifact(
            db,
            artifact,
            "d".repeat(64),
            decision,
            "Changed while transferring",
          );
          return { sha256: "d".repeat(64), md5: "verified", size: 10 };
        },
        range: async () => new Uint8Array(10),
        accessToken: async () => "token",
        createDrive: (token) => new DriveClient(token, transport),
        root: async () => "root",
      };
      const leased = await claimDelivery(db, randomUUID());
      await deliver(db, leased!, dependencies);
      const [row] = await db.query<{ status: string }>(
        sql`SELECT status FROM marketing_factory.tasks WHERE id=${task.id}`,
      );
      expect(row.status).toBe(
        decision === "approved" ? "completed" : "planned",
      );
    },
  );
  it("turns an expired fifth-attempt lease into an owner-retryable failure", async () => {
    const task = await createTask(db, {
      title: "Final attempt crashed",
      worker_id: "video_editor",
      description: "",
    });
    const artifact = randomUUID(),
      job = randomUUID();
    await db.query(
      sql`INSERT INTO marketing_factory.artifacts(id,task_id,title,type,sha256,bytes,storage_key) VALUES(${artifact},${task.id},'video.mp4','video',${"c".repeat(64)},10,'private-key')`,
    );
    await db.query(
      sql`INSERT INTO marketing_factory.delivery_jobs(id,artifact_id,status,attempts,lease_until,lease_owner) VALUES(${job},${artifact},'uploading',5,now()-interval '1 second',${randomUUID()})`,
    );
    await claimDelivery(db, randomUUID());
    const [row] = await db.query<{ status: string }>(
      sql`SELECT status FROM marketing_factory.delivery_jobs WHERE id=${job}`,
    );
    expect(row.status).toBe("failed");
  });
  it("leases a pending job once and recovers an expired lease", async () => {
    const task = await createTask(db, {
      title: "Real render output",
      worker_id: "video_editor",
      description: "",
    });
    const artifact = randomUUID();
    const job = randomUUID();
    await db.query(
      sql`INSERT INTO marketing_factory.artifacts(id,task_id,title,type,sha256,bytes,storage_key) VALUES(${artifact},${task.id},'video.mp4','video',${"a".repeat(64)},10,'personal-video/v1/runs/run-1/results/video.mp4')`,
    );
    await db.query(
      sql`INSERT INTO marketing_factory.delivery_jobs(id,artifact_id) VALUES(${job},${artifact})`,
    );
    const owner = randomUUID();
    expect((await claimDelivery(db, owner))?.id).toBe(job);
    expect(await claimDelivery(db, randomUUID())).toBeNull();
    await db.query(
      sql`UPDATE marketing_factory.delivery_jobs SET lease_until=now()-interval '1 second' WHERE id=${job}`,
    );
    expect((await claimDelivery(db, randomUUID()))?.id).toBe(job);
  });
  it("checks exact remote file bytes, checksum and destination", () => {
    const file = {
      size: "10",
      md5Checksum: "verified",
      parents: ["root"],
      trashed: false,
    };
    expect(verifiedDriveFile(file, 10, "verified", "root")).toBe(true);
    expect(
      verifiedDriveFile({ ...file, size: "9" }, 10, "verified", "root"),
    ).toBe(false);
    expect(
      verifiedDriveFile(
        { ...file, md5Checksum: "wrong" },
        10,
        "verified",
        "root",
      ),
    ).toBe(false);
    expect(
      verifiedDriveFile({ ...file, trashed: true }, 10, "verified", "root"),
    ).toBe(false);
  });
  it("uses confirmed upload progress and refuses foreign upload addresses", () => {
    expect(
      uploadedOffset(
        new Response(null, {
          status: 308,
          headers: { range: "bytes=0-262143" },
        }),
      ),
    ).toBe(262144);
    expect(uploadedOffset(new Response(null, { status: 308 }))).toBe(0);
    expect(validUploadUrl("https://attacker.example/upload/drive/")).toBe(
      false,
    );
    expect(
      validUploadUrl(
        "https://www.googleapis.com/upload/drive/v3/files?upload_id=x",
      ),
    ).toBe(true);
  });
  it("recovers a lost final upload response without creating a duplicate file", async () => {
    const task = await createTask(db, {
      title: "Lost upload response",
      worker_id: "video_editor",
      description: "",
    });
    const artifact = randomUUID(),
      job = randomUUID();
    await db.query(
      sql`INSERT INTO marketing_factory.artifacts(id,task_id,title,type,sha256,bytes,storage_key) VALUES(${artifact},${task.id},'video.mp4','video',${"b".repeat(64)},10,'private-video-key')`,
    );
    await db.query(
      sql`INSERT INTO marketing_factory.delivery_jobs(id,artifact_id) VALUES(${job},${artifact})`,
    );
    // Finish the previous test's recovered lease so this fixture is selected next.
    await db.query(
      sql`UPDATE marketing_factory.delivery_jobs SET status='delivered' WHERE id<>${job}`,
    );
    let uploaded = false,
      generatedIds = 0,
      uploads = 0;
    const transport: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("generateIds")) {
        generatedIds++;
        return Response.json({ ids: ["stable-file-id"] });
      }
      if (url.includes("/upload/drive/") && init?.method === "POST")
        return new Response(null, {
          status: 200,
          headers: {
            location:
              "https://www.googleapis.com/upload/drive/v3/files?upload_id=saved",
          },
        });
      if (url.includes("/upload/drive/") && init?.method === "PUT") {
        uploads++;
        uploaded = true;
        throw new Error("Network response lost after Drive committed the file");
      }
      if (url.includes("files/stable-file-id"))
        return uploaded
          ? Response.json({
              id: "stable-file-id",
              size: "10",
              md5Checksum: "verified",
              parents: ["root"],
              trashed: false,
            })
          : new Response(null, { status: 404 });
      throw new Error("Unexpected transport request");
    };
    const dependencies: DeliveryDependencies = {
      inspect: async () => ({
        sha256: "b".repeat(64),
        md5: "verified",
        size: 10,
      }),
      range: async () => new Uint8Array(10),
      accessToken: async () => "private-token",
      createDrive: (token) => new DriveClient(token, transport),
      root: async () => "root",
    };
    const first = await claimDelivery(db, randomUUID());
    expect(first?.id).toBe(job);
    await deliver(db, first!, dependencies);
    const [pending] = await db.query<{ status: string; drive_file_id: string }>(
      sql`SELECT status,drive_file_id FROM marketing_factory.delivery_jobs WHERE id=${job}`,
    );
    expect(pending).toEqual({
      status: "pending",
      drive_file_id: "stable-file-id",
    });
    await db.query(
      sql`UPDATE marketing_factory.delivery_jobs SET next_attempt_at=now() WHERE id=${job}`,
    );
    const second = await claimDelivery(db, randomUUID());
    await deliver(db, second!, dependencies);
    const [done] = await db.query<{ status: string }>(
      sql`SELECT status FROM marketing_factory.delivery_jobs WHERE id=${job}`,
    );
    expect(done.status).toBe("delivered");
    expect(generatedIds).toBe(1);
    expect(uploads).toBe(1);
  });
});
