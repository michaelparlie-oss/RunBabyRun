import { NextResponse, type NextRequest } from "next/server";
import { userFromToken } from "@/lib/auth";
import { signInAs } from "@/lib/server/authflow";

/** After an email confirmation link: exchange the Supabase token for a RunBabyRun session. */
export async function POST(req: NextRequest) {
  const { access_token } = (await req.json().catch(() => ({}))) as { access_token?: string };
  if (!access_token || access_token.length > 4000) return NextResponse.json({ ok: false }, { status: 400 });
  const r = await userFromToken(access_token);
  if (!r.ok) return NextResponse.json({ ok: false }, { status: 401 });
  await signInAs(r.value);
  return NextResponse.json({ ok: true });
}
