"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { updateCustomerNotes } from "@/lib/queries";

export async function saveCustomerNotesAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("customerId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (id) await updateCustomerNotes(id, notes || null);
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}
