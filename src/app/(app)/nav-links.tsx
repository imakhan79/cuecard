"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutGrid, Radio } from "lucide-react";

const LINKS = [
  { href: "/live", label: "Live Interview", icon: Radio, match: ["/live"] },
  { href: "/dashboard", label: "Interviews", icon: LayoutGrid, match: ["/dashboard", "/sessions", "/mock"] },
  { href: "/resumes", label: "Resumes", icon: FileText, match: ["/resumes"] },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {LINKS.map(({ href, label, icon: Icon, match }) => {
        const active = match.some((m) => pathname.startsWith(m));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
