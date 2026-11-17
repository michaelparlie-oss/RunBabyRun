import { NextResponse, type NextRequest } from "next/server";
import type { AuthUser } from "@/lib/auth";
import { originOf } from "@/lib/server/origin";
import { startSession } from "@/lib/session";
import { userForAuth } from "@/lib/users";

export const to = (req: NextRequest, path: string) => NextResponse.redirect(new URL(path, originOf(req)), 303);
export const field = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** Start a RunBabyRun session for a verified Supabase user. */
export async function signInAs(u: AuthUser, name = ""): Promise<void> {
  const user = await userForAuth(u.id, u.email.toLowerCase(), name || u.name);
  await startSession(user.uid);
}
