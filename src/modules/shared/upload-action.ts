"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requirePermission } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

/**
 * Image upload for master-data photos.
 *
 * Files are written under `public/uploads` and served as static assets. This
 * suits a single-server deployment; on serverless or multi-instance hosting
 * this needs to become object storage, and only this file changes.
 *
 * Everything about the incoming file is treated as hostile:
 *   - the caller must hold `master:update`
 *   - the MIME type must be one of a fixed image whitelist
 *   - the size is capped
 *   - the extension comes from OUR whitelist, never from the upload
 *   - the filename is a fresh UUID, so nothing the client sends can influence
 *     the path (no traversal, no overwrite, no executable name)
 */

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** MIME type -> the extension we will give the stored file. */
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface UploadResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export async function uploadImageAction(formData: FormData): Promise<UploadResult> {
  try {
    await requirePermission("master:update");
  } catch (error) {
    return {
      ok: false,
      error: isAppError(error) ? error.message : "You are not allowed to upload files.",
    };
  }

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image to upload." };
  }

  if (file.size > MAX_BYTES) {
    return { ok: false, error: "That image is larger than 2 MB. Choose a smaller one." };
  }

  const extension = ALLOWED[file.type];
  if (!extension) {
    return { ok: false, error: "Only PNG, JPEG, WebP and GIF images are supported." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Re-check the real size after reading: `file.size` is client-reported.
  if (bytes.byteLength > MAX_BYTES) {
    return { ok: false, error: "That image is larger than 2 MB. Choose a smaller one." };
  }

  // The stored name is ours alone -- the client cannot influence the path.
  const filename = `${randomUUID()}.${extension}`;
  const directory = path.join(process.cwd(), "public", "uploads");

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), bytes);
  } catch (error) {
    console.error("[upload] failed to store image:", error);
    return { ok: false, error: "The image could not be saved. Please try again." };
  }

  return { ok: true, url: `/uploads/${filename}` };
}
