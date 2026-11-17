import type { NextRequest } from "next/server";
import { signIn, validEmail } from "@/lib/auth";
import { field, signInAs, to } from "@/lib/server/authflow";

export async function POST(req: NextRequest) {
  const f = await req.formData();
  const email = field(f, "email").toLowerCase(), password = String(f.get("password") ?? "");
  if (!validEmail(email) || !password) return to(req, "/login?error=invalid");
  const r = await signIn(email, password);
  if (!r.ok) return to(req, `/login?error=${r.error}`);
  await signInAs(r.value.user);
  return to(req, "/");
}
