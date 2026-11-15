export type MeetingPlatform = "zoom" | "teams" | "meet" | "other";

export const PLATFORM_LABEL: Record<MeetingPlatform, string> = {
  zoom: "Zoom",
  teams: "Microsoft Teams",
  meet: "Google Meet",
  other: "Meeting",
};

export function detectPlatform(url: string | null | undefined): MeetingPlatform | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "zoom.us" || host.endsWith(".zoom.us") || host.endsWith(".zoomgov.com")) return "zoom";
  if (host === "teams.microsoft.com" || host === "teams.live.com" || host.endsWith(".teams.microsoft.com")) return "teams";
  if (host === "meet.google.com") return "meet";
  return "other";
}

/** Short per-platform tips for sharing meeting audio with the copilot. */
export const SHARE_TIPS: Record<MeetingPlatform, string> = {
  meet: "Open the Meet call in its own Chrome or Edge tab first. Then click Start copilot → choose “Chrome Tab” → pick the Meet tab → keep “Also share tab audio” ON → Share.",
  zoom: "Browser: join with “Join from your browser”, then Start copilot → “Chrome Tab” → pick the Zoom tab → keep “Also share tab audio” ON. Desktop app (Windows): Start copilot → “Entire screen” → switch ON “Also share system audio”.",
  teams: "Browser: join at teams.microsoft.com, then Start copilot → “Chrome Tab” → pick the Teams tab → keep “Also share tab audio” ON. Desktop app (Windows): Start copilot → “Entire screen” → switch ON “Also share system audio”.",
  other: "Start copilot → choose “Chrome Tab” and pick the call's tab with “Also share tab audio” ON, or “Entire screen” with “Also share system audio” ON (Windows). Sharing a single “Window” never includes sound.",
};
