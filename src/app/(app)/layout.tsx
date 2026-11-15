import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { getUser } from "@/lib/supabase/server";
import { NavLinks } from "./nav-links";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getUser();
  if (!user) redirect("/login"); // proxy already does this; defence in depth

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo href="/dashboard" />
          <div className="hidden sm:block">
            <NavLinks />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden max-w-48 truncate text-sm text-muted md:inline">{user.email}</span>
            <ThemeToggle />
            <form action={signOut}>
              <button type="submit" className="btn-ghost size-10 p-0" aria-label="Sign out" title="Sign out">
                <LogOut className="size-[18px]" />
              </button>
            </form>
          </div>
        </div>
        <div className="border-t border-border px-4 py-2 sm:hidden">
          <NavLinks />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
