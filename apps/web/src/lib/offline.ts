import type { TrustedContact } from "@/lib/api";

// Offline cache of the user's trusted-contact numbers so SOS can still arm and
// offer native-SMS fallback when there's no data connection.

const CONTACTS_CACHE_KEY = "safeher-contacts-cache";

export function cacheTrustedContacts(contacts: TrustedContact[]): void {
  try {
    localStorage.setItem(CONTACTS_CACHE_KEY, JSON.stringify(contacts));
  } catch {
    // ignore storage access errors (private mode)
  }
}

export function cachedTrustedContacts(): TrustedContact[] {
  try {
    const raw = localStorage.getItem(CONTACTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrustedContact[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Lightweight "am I on a network" helper; false negatives survive as fetch
 *  failures, which the SOS flow treats the same way. */
export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** True for the network failures thrown by fetch() (not HTTP errors). */
export function isNetworkError(error: unknown): boolean {
  return error instanceof Error && error.name === "TypeError" && /fetch/i.test(error.message);
}