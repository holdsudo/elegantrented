"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseGownCondition } from "@/lib/enums";
import { requireUser } from "@/lib/auth";
import {
  createGown,
  createGownPhoto,
  deleteGown,
  deleteGownPhoto,
  findGownByNumber,
  listPhotoRefsForGown,
  updateGown
} from "@/lib/queries";
import { centsFromInput } from "@/lib/money";
import { parseDay } from "@/lib/dates";
import { maxPhotoBytes, putPhoto, removePhoto } from "@/lib/photo-storage";

export type GownValues = {
  number: string;
  description: string;
  size: string;
  color: string;
  price: string;
  condition: string;
  published: boolean;
  notes: string;
  acquiredOn: string;
  cost: string;
};

export type GownFormState = { error?: string; values?: GownValues } | null;

/** Echoed back on a rejected submit — React clears the form once the action returns. */
function readValues(formData: FormData): GownValues {
  const text = (key: string) => String(formData.get(key) ?? "");
  return {
    number: text("number"),
    description: text("description"),
    size: text("size"),
    color: text("color"),
    price: text("price"),
    condition: text("condition") || "GOOD",
    published: text("published") !== "0",
    notes: text("notes"),
    acquiredOn: text("acquiredOn"),
    cost: text("cost")
  };
}

const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function saveGownAction(
  _prev: GownFormState,
  formData: FormData
): Promise<GownFormState> {
  await requireUser();

  const values = readValues(formData);
  const id = String(formData.get("id") ?? "").trim();
  const number = String(formData.get("number") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const condition = parseGownCondition(formData.get("condition"));
  const published = String(formData.get("published") ?? "1") !== "0";
  const acquiredOn = parseDay(formData.get("acquiredOn"));
  const costCents = centsFromInput(formData.get("cost"));
  const priceCents = centsFromInput(formData.get("price"));

  if (!number) return { error: "A gown number is required — it's the tag on the garment.", values };
  if (!description) return { error: "A description is required.", values };

  const clash = await findGownByNumber(number);
  if (clash && clash.id !== id) {
    return { error: `Gown #${number} already exists.`, values };
  }

  const data = {
    number,
    description,
    size: size || null,
    color: color || null,
    notes: notes || null,
    condition,
    published,
    priceCents,
    acquiredOn,
    costCents
  };

  let gownId = id;
  if (id) {
    await updateGown(id, data);
  } else {
    gownId = await createGown(data);
  }

  const photos = formData.getAll("photos").filter((entry): entry is File => entry instanceof File);
  for (const photo of photos) {
    if (photo.size === 0) continue;
    const limit = maxPhotoBytes();
    if (photo.size > limit) {
      return {
        error: `${photo.name} is ${(photo.size / 1_048_576).toFixed(1)} MB — the limit is ${(limit / 1_048_576).toFixed(1)} MB.`,
        values
      };
    }
    if (photo.type && !ALLOWED_PHOTO_TYPES.includes(photo.type)) {
      return { error: `${photo.name} isn't an image file.`, values };
    }
    const buffer = Buffer.from(await photo.arrayBuffer());
    const contentType = photo.type || "image/jpeg";

    let stored;
    try {
      stored = await putPhoto(buffer, contentType, gownId);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "That photo could not be stored.",
        values
      };
    }

    await createGownPhoto({
      gownId,
      filename: photo.name || "photo",
      contentType,
      bytes: buffer.byteLength,
      ...stored
    });
  }

  revalidatePath("/gowns");
  revalidatePath(`/gowns/${gownId}`);
  redirect(`/gowns/${gownId}`);
}

export async function deletePhotoAction(formData: FormData) {
  await requireUser();
  const photoId = String(formData.get("photoId") ?? "");
  const gownId = String(formData.get("gownId") ?? "");
  if (photoId) {
    const photo = await deleteGownPhoto(photoId);
    if (photo) await removePhoto(photo);
  }
  revalidatePath(`/gowns/${gownId}`);
  redirect(`/gowns/${gownId}`);
}

export async function deleteGownAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("gownId") ?? "");
  if (id) {
    // Clear the stored objects first — the row cascade would otherwise strand them.
    const photos = await listPhotoRefsForGown(id);
    await Promise.all(photos.map(removePhoto));

    // Rentals keep their history; deleteGown nulls their gown link first.
    await deleteGown(id);
  }
  revalidatePath("/gowns");
  revalidatePath("/");
  redirect("/gowns");
}
