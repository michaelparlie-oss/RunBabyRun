import type { NextRequest } from "next/server";
import { sendReset, validEmail } from "@/lib/auth";
import { field, to } from "@/lib/server/authflow";
import { originOf } from "@/lib/server/origin";

/** Always answers "sent" for a well-formed address, so the form cannot be used to find out who has an account. */
export async function POST(req: NextRequest) {
  const email = field(await req.formData(), "email").toLowerCase();
  if (!validEmail(email)) return to(req, "/forgot?error=fields");
  const r = await sendReset(email, `${originOf(req)}/auth/callback`);
  if (!r.ok && (r.error === "not_configured" || r.error === "rate" || r.error === "network" || r.error === "email_send")) return to(req, `/forgot?error=${r.error}`);
  return to(req, "/forgot?sent=1");
}
