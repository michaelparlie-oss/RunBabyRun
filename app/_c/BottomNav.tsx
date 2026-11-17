"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ICONS, Icon } from "./nav";

const main = [
  { href: "/", label: "Today", icon: ICONS.today },
  { href: "/week", label: "Week", icon: ICONS.week },
  { href: "/plan", label: "Plan", icon: ICONS.plan },
  { href: "/progress", label: "Progress", icon: ICONS.progress },
  { href: "/settings", label: "Settings", icon: ICONS.settings },
];
const extra = [
  { href: "/library", label: "Exercise library", icon: ICONS.library },
  { href: "/about", label: "How plans are built", icon: ICONS.checkpoints },
];

function useActive() {
  const p = usePathname();
  return (h: string) => (h === "/" ? p === "/" : p === h || p.startsWith(`${h}/`) || (h === "/week" && (p.startsWith("/session") || p.startsWith("/strength"))));
}

export function BottomNav() {
  const active = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {main.map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-current={active(i.href) ? "page" : undefined} className={`flex flex-col items-center gap-0.5 border-t-4 py-2 text-xs font-semibold ${active(i.href) ? "border-hivis-deep bg-wash text-ink" : "border-transparent text-muted"}`}>
              <Icon d={i.icon} className="h-6 w-6" />
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Sidebar({ name }: { name: string }) {
  const active = useActive();
  const Item = ({ href, label, icon }: { href: string; label: string; icon: string }) => (
    <Link href={href} aria-current={active(href) ? "page" : undefined} className={`flex items-center gap-3 border-l-4 px-4 py-2.5 text-[15px] font-semibold ${active(href) ? "border-hivis bg-white/10 text-white" : "border-transparent text-white/70 hover:text-white"}`}>
      <Icon d={icon} />
      <span className="flex-1">{label}</span>
    </Link>
  );
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-ink text-white lg:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-9 w-9 border border-white/20" />
        <div>
          <div className="display text-2xl">RunBabyRun</div>
          <div className="text-xs text-white/70">{name}</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto" aria-label="Main">
        
        {main.map((i) => <Item key={i.href} {...i} />)}
        <div className="mx-5 my-3 border-t border-white/20" />
        {extra.map((i) => <Item key={i.href} {...i} />)}
      </nav>
      <p className="px-5 pb-4 text-xs text-white/60">Powered by Strava</p>
    </aside>
  );
}
