import { NextResponse, type NextRequest } from "next/server";
import { setPassword, validPassword } from "@/lib/auth";
import { signInAs } from "@/lib/server/authflow";

/** After a password-reset link: set the new password, then sign in. */
export async function POST(req: NextRequest) {
  const { access_token, password } = (await req.json().catch(() => ({}))) as { access_token?: string; password?: string };
  if (!access_token || access_token.length > 4000 || !password || !validPassword(password)) return NextResponse.json({ ok: false, error: "weak" }, { status: 400 });
  const r = await setPassword(access_token, password);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 401 });
  await signInAs(r.value);
  return NextResponse.json({ ok: true });
}
