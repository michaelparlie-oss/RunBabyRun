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
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {main.map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-current={active(i.href) ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active(i.href) ? "text-accent" : "text-muted"}`}>
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
    <Link href={href} aria-current={active(href) ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active(href) ? "bg-accent-soft text-accent-strong" : "text-ink-2 hover:bg-slate-100 hover:text-ink"}`}>
      <Icon d={icon} />
      <span className="flex-1">{label}</span>
    </Link>
  );
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-white lg:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg" />
        <div>
          <div className="text-sm font-extrabold leading-tight">RunBabyRun</div>
          <div className="text-xs text-muted">{name}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main">
        <div className="label px-3 pb-1 pt-2">Training</div>
        {main.map((i) => <Item key={i.href} {...i} />)}
        <div className="label px-3 pb-1 pt-5">Reference</div>
        {extra.map((i) => <Item key={i.href} {...i} />)}
      </nav>
      <p className="px-5 pb-4 text-[11px] text-muted">Powered by Strava</p>
    </aside>
  );
}
