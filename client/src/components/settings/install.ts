/**
 * "Add to Home Screen" support.
 *
 * Chromium browsers fire `beforeinstallprompt` once, early, when the app is installable. This
 * module starts listening as soon as it is imported (the Settings chunk) and also picks up an
 * event stashed on `window.__poInstallPrompt` by the app entry, if one exists.
 */
import { useEffect, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

type InstallWindow = Window & { __poInstallPrompt?: BeforeInstallPromptEvent | null };

let deferred: BeforeInstallPromptEvent | null =
  typeof window !== "undefined" ? (window as InstallWindow).__poInstallPrompt ?? null : null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export type DevicePlatform = "ios" | "android" | "desktop";

export function detectPlatform(): DevicePlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** The browser's install prompt (Chrome, Edge, Android), whether the app is installed, and a way to trigger it. */
export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(deferred);
  const [justInstalled, setJustInstalled] = useState(false);
  const standaloneQuery = useMediaQuery("(display-mode: standalone)");
  const standalone =
    standaloneQuery || (typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true);

  useEffect(() => {
    const sync = () => setEvent(deferred);
    listeners.add(sync);
    const onInstalled = () => setJustInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    sync();
    return () => {
      listeners.delete(sync);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /** Shows the browser's install dialog. Resolves to true when the person accepts. */
  const install = async (): Promise<boolean> => {
    const e = deferred;
    if (!e) return false;
    await e.prompt();
    const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    // A prompt can only be used once.
    deferred = null;
    notify();
    return choice.outcome === "accepted";
  };

  return { canInstall: !!event, install, installed: standalone || justInstalled };
}
