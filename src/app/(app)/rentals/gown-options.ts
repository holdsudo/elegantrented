import { listGownOptions } from "@/lib/queries";
import type { GownOption } from "./rental-form";

/** Every gown still in service, plus any gown already attached to this rental. */
export async function loadGownOptions(includeGownId?: string | null): Promise<GownOption[]> {
  const gowns = await listGownOptions(includeGownId);

  // "118" should sort after "87", not before it.
  return gowns.sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: "base" })
  );
}
