"use client";

import { useEffect, useState } from "react";

import { authClient } from "./auth-client";

export interface ActiveUser {
  id: string;
  name: string;
  email: string;
  isDemo: boolean;
}

const DEMO_KEY = "safeher-demo-session";

const DEMO_USER: ActiveUser = {
  id: "test-user-001",
  name: "Aarav (Demo)",
  email: "demo@safeher.app",
  isDemo: true,
};

export function getDemoUser(): ActiveUser | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DEMO_KEY) ? DEMO_USER : null;
  } catch {
    return null;
  }
}

export function setDemoSession() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_KEY, "1");
}

export function clearDemoSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DEMO_KEY);
}

/**
 * Returns the active user for the UI: a real better-auth session if one
 * exists, otherwise the demo user (test-user-001) if they opted in.
 */
export function useActiveUser(): { user: ActiveUser | null; isLoading: boolean } {
  const { data: session, isPending } = authClient.useSession();
  const [demoUser, setDemoUser] = useState<ActiveUser | null>(null);

  useEffect(() => {
    setDemoUser(getDemoUser());
  }, []);

  const realUser = session?.user
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        isDemo: false,
      }
    : null;

  return {
    user: realUser ?? demoUser,
    isLoading: isPending && !demoUser,
  };
}
