import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./login-form";
import { withBase } from "@/lib/base-path";

export const metadata = {
  title: "Sign in",
  // A staff login has no place in search results.
  robots: { index: false, follow: false }
};

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  const settings = await getSettings();

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="login-head">
          <img className="login-logo" src={withBase("/logo.png")} alt={settings.brandName} width={507} height={360} />
          <span className="kicker">Atelier · Private</span>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
