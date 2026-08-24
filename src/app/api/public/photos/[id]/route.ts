import { NextResponse } from "next/server";
import { getGownPhoto, getPublicGown } from "@/lib/queries";
import { readPhoto } from "@/lib/photo-storage";

/**
 * Photos for the storefront, with no session required.
 *
 * The gate is the gown, not the viewer: a photo is served only if its gown is
 * published and not retired. Unpublishing a gown makes its photos unreachable
 * here immediately, and the admin route stays the only way to see the rest.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const photo = await getGownPhoto(id);
  if (!photo) {
    return new NextResponse("Not found", { status: 404 });
  }

  const gown = await getPublicGown(photo.gownId);
  if (!gown) {
    return new NextResponse("Not found", { status: 404 });
  }

  const bytes = await readPhoto(photo);
  if (!bytes) {
    return new NextResponse("Photo unavailable", { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=3600"
    }
  });
}
