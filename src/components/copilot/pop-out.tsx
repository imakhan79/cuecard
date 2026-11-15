"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

type PipApi = { requestWindow(opts: { width: number; height: number }): Promise<Window> };

function pipApi(): PipApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture ?? null;
}

const noop = () => () => {};

/**
 * Floating always-on-top window (Document Picture-in-Picture, Chrome/Edge 116+).
 * Lets the copilot sit on top of Zoom / Teams / Meet, including their desktop apps.
 */
export function usePopOut() {
  const supported = useSyncExternalStore(noop, () => pipApi() !== null, () => false);
  const [win, setWin] = useState<Window | null>(null);

  const open = useCallback(async () => {
    const api = pipApi();
    if (!api) return;
    const w = await api.requestWindow({ width: 440, height: 600 });

    // Copy styles so Tailwind classes and theme tokens work in the new window.
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const style = w.document.createElement("style");
        style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
        w.document.head.appendChild(style);
      } catch {
        if (sheet.href) {
          const link = w.document.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          w.document.head.appendChild(link);
        }
      }
    }
    w.document.title = "Cuecard Copilot";
    w.document.documentElement.className = document.documentElement.className;
    w.document.documentElement.style.colorScheme = document.documentElement.style.colorScheme;
    w.document.body.className = "bg-bg text-fg antialiased";
    w.addEventListener("pagehide", () => setWin(null));
    setWin(w);
  }, []);

  const close = useCallback(() => win?.close(), [win]);

  // Keep the pop-out's theme in sync with the main window.
  useEffect(() => {
    if (!win) return;
    const sync = () => {
      win.document.documentElement.className = document.documentElement.className;
    };
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => obs.disconnect();
  }, [win]);

  return { supported, win, open, close };
}

export function PopOutPortal({ win, children }: { win: Window; children: React.ReactNode }) {
  return createPortal(children, win.document.body);
}
