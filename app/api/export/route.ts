import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { loadCtx } from "@/lib/server/view";

/** Everything stored about the signed-in runner, minus Strava tokens and keys. */
export async function GET() {
  const uid = await currentUser();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const c = await loadCtx(uid);
  const account = c.user && { email: c.user.email, name: c.user.name, runs_from: c.user.source, created_at: c.user.created_at };
  const strava = c.account && { athlete_id: c.account.athlete_id, firstname: c.account.firstname, lastname: c.account.lastname, created_at: c.account.created_at, mode: c.account.mode };
  return new NextResponse(JSON.stringify({ exported_at: new Date().toISOString(), account, strava, profile: c.profile, plan: c.plan, activities: c.acts, logs: c.logs }, null, 1), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="runbabyrun-export.json"', "Cache-Control": "no-store" },
  });
}
