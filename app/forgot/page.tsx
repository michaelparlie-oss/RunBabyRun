import Link from "next/link";
import { AuthShell, lbl, lnk } from "@/app/_c/AuthShell";

export const metadata = { title: "Reset your password · RunBabyRun" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const q = await searchParams;
  return (
    <AuthShell title="Reset your password" error={q.error} notice={q.sent ? "If that address has an account, a reset link is on its way. It can take a few minutes." : undefined} foot={<Link href="/login" className={lnk}>Back to log in</Link>}>
      <form action="/api/auth/forgot" method="post" className="space-y-4">
        <label className={lbl}>Email<input name="email" type="email" required autoComplete="email" className="input mt-1" /></label>
        <button className="btn btn-primary w-full">Send reset link</button>
      </form>
    </AuthShell>
  );
}
