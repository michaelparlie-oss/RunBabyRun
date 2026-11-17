import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { connection } from "next/server";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "./globals.css";
import { BottomNav, Sidebar } from "./_c/BottomNav";
import { LiveRefresh } from "./_c/LiveRefresh";
import { liveConfig, type LiveConfig } from "@/lib/live";
import { currentUser } from "@/lib/session";
import { getStore } from "@/lib/storage";
import type { Profile, User } from "@/lib/types";

export const metadata: Metadata = { title: "RunBabyRun", description: "A day-by-day race training plan for a 5K, 10K, half marathon or marathon. Track runs with Strava or by hand." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#e9e4f7" };

async function who(): Promise<{ name: string; hasPlan: boolean; live: LiveConfig | null } | null> {
  try {
    const uid = await currentUser();
    if (!uid) return null;
    const store = await getStore();
    const [user, prof] = await Promise.all([store.get<User>(String(uid), "user"), store.get<Profile>(String(uid), "profile")]);
    return user ? { name: user.name, hasPlan: !!prof, live: await liveConfig(uid) } : null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection(); // every page depends on the signed-in runner: always render on request
  const me = await who();
  const nav = !!me?.hasPlan;
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {nav && <Sidebar name={me!.name} />}
        <div className={nav ? "lg:pl-64" : ""}>
          <main className={`mx-auto px-4 pt-4 lg:px-8 lg:pt-8 ${nav ? "max-w-xl pb-28 lg:max-w-5xl lg:pb-12" : "max-w-4xl pb-10"}`}>{children}</main>
          {!nav && (
            <footer className="mx-auto max-w-4xl px-4 pb-10 text-sm text-muted lg:px-8">
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t-2 border-line-strong pt-4">
                <Link href="/" className="hover:underline">Home</Link>
                <Link href="/about" className="hover:underline">How plans are built</Link>
                <Link href="/privacy" className="hover:underline">Privacy</Link>
                <Link href="/terms" className="hover:underline">Terms</Link>
                <span className="ml-auto">Powered by Strava</span>
              </div>
            </footer>
          )}
        </div>
        {nav && <BottomNav />}
        {nav && <LiveRefresh live={me!.live} />}
      </body>
    </html>
  );
}
