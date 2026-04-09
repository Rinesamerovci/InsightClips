import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";

export type StagedUploadManifest = {
  upload_reference: string;
  filename: string;
  filesize_bytes: number;
  mime_type: string | null;
  storage_path: string;
  created_at: string;
};

const STAGING_ROOT = path.join(os.tmpdir(), "insightclips-upload-staging");
const MANIFEST_FILENAME = "manifest.json";

function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "upload.bin";
}

function getManifestPath(uploadReference: string): string {
  return path.join(STAGING_ROOT, uploadReference, MANIFEST_FILENAME);
}

export async function stageUploadFile(file: File): Promise<StagedUploadManifest> {
  const uploadReference = randomUUID();
  const directory = path.join(STAGING_ROOT, uploadReference);
  const filename = sanitizeFilename(file.name);
  const storagePath = path.join(directory, filename);
  const manifest: StagedUploadManifest = {
    upload_reference: uploadReference,
    filename,
    filesize_bytes: file.size,
    mime_type: file.type || null,
    storage_path: storagePath,
    created_at: new Date().toISOString(),
  };

  await mkdir(directory, { recursive: true });
  await writeFile(storagePath, Buffer.from(await file.arrayBuffer()));
  await writeFile(getManifestPath(uploadReference), JSON.stringify(manifest, null, 2), "utf8");

  return manifest;
}

export async function getStagedUpload(uploadReference: string): Promise<StagedUploadManifest | null> {
  try {
    const manifest = await readFile(getManifestPath(uploadReference), "utf8");
    return JSON.parse(manifest) as StagedUploadManifest;
  } catch {
    return null;
  }
}
