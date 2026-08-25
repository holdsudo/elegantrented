import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in",
  // A staff login has no place in search results.
  robots: { index: false, follow: false }
};

/** "Elegant Rented" -> "ER" */
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  const settings = await getSettings();

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="login-head">
          <span className="brand-mark">{initials(settings.brandName)}</span>
          <h1>{settings.brandName}</h1>
          <span className="kicker">Atelier · Private</span>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
