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
  meet: "Open the Meet call in a Chrome or Edge tab. When sharing, pick that tab and turn on “Also share tab audio”.",
  zoom: "In the browser: join with “Join from your browser” and share that tab with tab audio on. In the Zoom desktop app: share your entire screen and turn on “Also share system audio” (Windows/ChromeOS).",
  teams: "In the browser: join from teams.microsoft.com and share that tab with tab audio on. In the Teams desktop app: share your entire screen and turn on “Also share system audio” (Windows/ChromeOS).",
  other: "Share the tab or screen where the call is running, and turn on the audio-sharing option.",
};
