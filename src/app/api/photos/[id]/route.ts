import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getGownPhoto } from "@/lib/queries";
import { readPhoto } from "@/lib/photo-storage";

/**
 * The only way a gown photo reaches a browser. Reads go through here rather than
 * through a public bucket URL so the session check still applies — the Supabase
 * bucket stays private and its key never leaves the server.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return new NextResponse("Not authorized", { status: 401 });
  }

  const { id } = await context.params;
  const photo = await getGownPhoto(id);
  if (!photo) {
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
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="${photo.filename.replace(/[^\w.\-]/g, "_")}"`
    }
  });
}
