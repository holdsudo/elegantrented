"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword, requireUser, startSession } from "@/lib/auth";
import { updateUserPassword } from "@/lib/queries";
import { SETTING_DEFAULTS, setSetting, type SettingKey } from "@/lib/settings";

export async function saveSettingsAction(formData: FormData) {
  await requireUser();

  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    const raw = formData.get(key);
    if (raw == null) continue;
    await setSetting(key, String(raw).trim());
  }

  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  // Deliberately permissive: the owner set a short password on purpose.
  // See the security note in README.md.
  if (password.length < 4) redirect("/settings?error=short");
  if (password !== confirm) redirect("/settings?error=mismatch");

  // Bumping the session version invalidates every other outstanding cookie.
  const sessionVersion = await updateUserPassword(user.id, await hashPassword(password));

  await startSession(user.id, sessionVersion);
  redirect("/settings?saved=password");
}
