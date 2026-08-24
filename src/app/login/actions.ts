"use server";

import { redirect } from "next/navigation";
import { startSession, verifyCredentials, endSession } from "@/lib/auth";
import { checkLoginRate, clientIp, recordLoginAttempt } from "@/lib/rate-limit";

export type LoginState = { error?: string } | null;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const login = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!login || !password) {
    return { error: "Enter your username and password." };
  }

  const identifier = login.toLowerCase();
  const ip = await clientIp();

  const verdict = await checkLoginRate(identifier, ip);
  if (verdict.blocked) {
    return {
      error: `Too many failed sign-ins. Try again in ${verdict.minutes} minutes.`
    };
  }

  const user = await verifyCredentials(login, password);
  await recordLoginAttempt(identifier, ip, Boolean(user));

  if (!user) {
    return { error: "That username and password don't match an account." };
  }

  await startSession(user.id, user.sessionVersion);
  redirect("/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
