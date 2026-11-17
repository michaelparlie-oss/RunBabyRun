import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, lbl, lnk } from "@/app/_c/AuthShell";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Create an account · RunBabyRun" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const q = await searchParams;
  return (
    <AuthShell title="Create your account" error={q.error} foot={<>Already have an account? <Link href="/login" className={lnk}>Log in</Link></>}>
      <form action="/api/auth/signup" method="post" className="space-y-4">
        <label className={lbl}>First name<input name="name" required maxLength={40} autoComplete="given-name" className="input mt-1" /></label>
        <label className={lbl}>Email<input name="email" type="email" required autoComplete="email" className="input mt-1" /></label>
        <label className={lbl}>Password<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input mt-1" /><span className="mt-1 block text-xs font-normal text-muted">At least 8 characters.</span></label>
        <button className="btn btn-primary w-full">Create account</button>
      </form>
      <p className="mt-4 text-xs text-muted">Next you choose how to track your runs: connect Strava, or log them yourself. By creating an account you agree to the <Link href="/terms" className="underline">terms</Link> and <Link href="/privacy" className="underline">privacy notice</Link>.</p>
    </AuthShell>
  );
}
