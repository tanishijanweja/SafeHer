"use client";

import { useEffect } from "react";

/**
 * Registers the offline/service-worker once the app is usable and the window
 * is idle, so it never competes with first-paint or HMR.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    const onLoad = () => {
      if (cancelled) return;
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Notify the SW when there's a new report/homepage build, so pages
          // update in a background tab rather than randomly mid-session.
          void reg.update();
        })
        .catch(() => {
          // Ignore — the app still works fully online.
        });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }
    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return null;
}
