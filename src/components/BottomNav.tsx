"use client";

// The app's bottom menu (Bob's simplified shell, 2026-11-01): four
// doors and nothing else — SOS for the moment, Talk to Me for the
// open conversation, Intake for new users building their context,
// and Statistics for the history over time (what you talked about,
// what your second brain suggested, which exercises it ran — the
// dashboard's record). Present on every page so any door is always
// one tap away; the home page itself leads with the Second Brain.

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: string; label: string; match: string[]; accent?: boolean }[] = [
  { href: "/pause?sos=1", label: "SOS", match: ["/pause"], accent: true },
  { href: "/talk", label: "Talk to Me", match: ["/talk"] },
  { href: "/story", label: "Intake", match: ["/story"] },
  { href: "/dashboard", label: "Statistics", match: ["/dashboard", "/memory"] },
];

export default function BottomNav() {
  const pathname = usePathname() ?? "/";
  return (
    <>
      <div aria-hidden="true" className="h-20" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid w-full max-w-2xl grid-cols-4">
          {ITEMS.map((item) => {
            const active = item.match.some(
              (m) => pathname === m || pathname.startsWith(`${m}/`),
            );
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 px-2 py-3 text-center text-sm font-semibold transition ${
                  item.accent
                    ? "text-[#9a3b26]"
                    : active
                      ? "text-[#2f5d3a]"
                      : "text-stone-500 hover:text-[#2f5d3a]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    active
                      ? item.accent
                        ? "bg-[#9a3b26]"
                        : "bg-[#2f5d3a]"
                      : "bg-transparent"
                  }`}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
