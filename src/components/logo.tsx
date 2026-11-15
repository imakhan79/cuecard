import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight text-fg">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M7 10h10M7 14h6" />
        </svg>
      </span>
      <span className="text-[17px]">Cuecard</span>
    </Link>
  );
}
