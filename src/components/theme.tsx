"use client";

import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { useSyncExternalStore } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

const noop = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // Theme is only known on the client; render a neutral icon until mounted.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  const order = ["system", "light", "dark"] as const;
  const current = mounted ? ((theme as (typeof order)[number]) ?? "system") : "system";
  const next = order[(order.indexOf(current) + 1) % order.length];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="btn-ghost size-10 p-0"
      aria-label={`Theme: ${current}. Switch to ${next}.`}
      title={`Theme: ${current}`}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
