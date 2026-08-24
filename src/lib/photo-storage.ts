import { photoBucket } from "@/lib/d1";
import type { PhotoStorage } from "@/lib/enums";

/**
 * Where gown photos physically live.
 *
 * On Cloudflare the bucket is a Worker binding, so there are no API keys, no
 * signing, and no endpoint to configure — R2 is simply there. That also keeps the
 * Worker bundle small, which matters on the free plan.
 *
 * The DB driver stays for local development without bindings, and because every
 * row records which driver wrote it, photos stored one way keep reading correctly
 * after a switch.
 *
 * Reads always go back through the app's own /api/photos route, never a public
 * bucket URL, so the session check still applies.
 */

export type StoredPhoto = {
  storage: PhotoStorage;
  data: string | null;
  storageKey: string | null;
};

type PhotoRow = { storage: string; data: string | null; storageKey: string | null };

/** R2 when the binding is present, otherwise base64 in the database. */
export function activeDriver(): PhotoStorage {
  return photoBucket() ? "R2" : "DB";
}

function objectKey(gownId: string, contentType: string) {
  const extension = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
  return `${gownId}/${crypto.randomUUID()}.${extension}`;
}

/**
 * D1 caps a single value at 2 MB, and base64 inflates bytes by about 4/3, so a
 * photo stored in the database has to come in under roughly 1.4 MB. The browser
 * downscaler normally lands around 50 KB — this only catches the case where it
 * was bypassed.
 */
export const MAX_DB_PHOTO_BYTES = 1_400_000;

export function maxPhotoBytes(): number {
  return photoBucket() ? 8 * 1024 * 1024 : MAX_DB_PHOTO_BYTES;
}

export async function putPhoto(
  buffer: Buffer,
  contentType: string,
  gownId: string
): Promise<StoredPhoto> {
  const bucket = photoBucket();

  if (bucket) {
    const key = objectKey(gownId, contentType);
    await bucket.put(key, new Uint8Array(buffer), {
      httpMetadata: { contentType }
    });
    return { storage: "R2", data: null, storageKey: key };
  }

  if (buffer.byteLength > MAX_DB_PHOTO_BYTES) {
    throw new Error(
      "That photo is too large to store. Try a smaller image, or one taken with the camera rather than a scan."
    );
  }

  return { storage: "DB", data: buffer.toString("base64"), storageKey: null };
}

export async function readPhoto(photo: PhotoRow): Promise<Buffer | null> {
  if (photo.storage === "DB") {
    return photo.data ? Buffer.from(photo.data, "base64") : null;
  }
  if (!photo.storageKey) return null;

  const bucket = photoBucket();
  if (!bucket) return null;

  const object = await bucket.get(photo.storageKey);
  if (!object) return null;

  return Buffer.from(await object.arrayBuffer());
}

/** Best-effort — a stranded object costs storage, a failed delete shouldn't 500. */
export async function removePhoto(photo: { storage: string; storageKey: string | null }) {
  if (photo.storage === "DB" || !photo.storageKey) return;

  const bucket = photoBucket();
  if (!bucket) return;

  try {
    await bucket.delete(photo.storageKey);
  } catch {
    // Leave the object behind rather than failing the user's delete.
  }
}
