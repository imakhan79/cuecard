"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function isDemoEnabled() {
  return Boolean(process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD);
}

/** Signs in to the shared demo account. Credentials stay on the server. */
export async function signInDemo(): Promise<{ error: string } | undefined> {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) return { error: "The demo account isn't set up on this server." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Couldn't open the demo right now. Please try again." };

  redirect("/dashboard");
}
