import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, lbl, lnk } from "@/app/_c/AuthShell";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Log in · RunBabyRun" };
const NOTICES: Record<string, string> = { confirm: "Check your email and open the confirmation link, then log in here.", reset: "Password changed. Log in with the new one." };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  if (await currentUser()) redirect("/");
  const q = await searchParams;
  return (
    <AuthShell title="Log in" error={q.error} notice={q.notice ? NOTICES[q.notice] : undefined} foot={<>New here? <Link href="/signup" className={lnk}>Create an account</Link></>}>
      <form action="/api/auth/login" method="post" className="space-y-4">
        <label className={lbl}>Email<input name="email" type="email" required autoComplete="email" className="input mt-1" /></label>
        <label className={lbl}>Password<input name="password" type="password" required autoComplete="current-password" className="input mt-1" /></label>
        <button className="btn btn-primary w-full">Log in</button>
      </form>
      <p className="mt-4 text-sm"><Link href="/forgot" className={lnk}>Forgot your password?</Link></p>
    </AuthShell>
  );
}
