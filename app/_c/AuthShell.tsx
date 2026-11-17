import Link from "next/link";
import { Flash } from "./ui";

export const AUTH_ERRORS: Record<string, string> = {
  fields: "Enter your name and a valid email address.",
  weak: "Use a password of at least 8 characters.",
  invalid: "That email and password don't match an account.",
  unconfirmed: "Confirm your email first: open the link we sent you, then log in.",
  exists: "An account with that email already exists. Log in instead.",
  rate: "Too many attempts. Wait a few minutes and try again.",
  email_send: "The site could not send email to that address. Tell the site owner.",
  not_configured: "Accounts are not set up on this site yet.",
  network: "Could not reach the sign-in service. Try again in a minute.",
  signin: "Log in first, then connect Strava.",
};

export function AuthShell({ title, error, notice, children, foot }: { title: string; error?: string; notice?: string; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md pt-4 lg:pt-10">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-7 w-7" />RunBabyRun
      </Link>
      <h1 className="display mt-6 text-6xl">{title}</h1>
      <div className="mt-5 space-y-3">
        {notice && <Flash ok>{notice}</Flash>}
        {error && <Flash ok={false}>{AUTH_ERRORS[error] ?? "Something went wrong. Try again."}</Flash>}
      </div>
      <div className="mt-5">{children}</div>
      {foot && <p className="mt-6 border-t-2 border-ink pt-4 text-sm">{foot}</p>}
    </div>
  );
}
export const lbl = "block text-sm font-semibold";
export const lnk = "font-semibold underline underline-offset-4";
