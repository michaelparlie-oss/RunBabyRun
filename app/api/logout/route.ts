import { NextResponse, type NextRequest } from "next/server";
import { originOf } from "@/lib/server/origin";
import { endSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  await endSession();
  return NextResponse.redirect(new URL("/", originOf(req)), 303);
}
