import type { NextRequest } from "next/server";
import { signUp, validEmail, validPassword } from "@/lib/auth";
import { field, signInAs, to } from "@/lib/server/authflow";
import { originOf } from "@/lib/server/origin";

export async function POST(req: NextRequest) {
  const f = await req.formData();
  const name = field(f, "name").slice(0, 40), email = field(f, "email").toLowerCase(), password = String(f.get("password") ?? "");
  if (!name || !validEmail(email)) return to(req, "/signup?error=fields");
  if (!validPassword(password)) return to(req, "/signup?error=weak");
  const r = await signUp(email, password, name, `${originOf(req)}/auth/callback`);
  if (!r.ok) return to(req, `/signup?error=${r.error}`);
  if (!r.value.signedIn || !r.value.user) return to(req, "/login?notice=confirm");
  await signInAs(r.value.user, name);
  return to(req, "/start");
}
