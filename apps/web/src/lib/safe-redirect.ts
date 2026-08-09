/**
 * Allowlist helper for post-login redirects. The `?redirect=` query param is
 * attacker-controlled; only a same-origin relative path is ever allowed, which
 * blocks open-redirect (`https://evil.com`), protocol (`javascript:`) and
 * backslash/scheme confusion (`/\\evil.com`) attacks.
 */
export function safeRedirect(
  raw: string | null | undefined,
  fallback = "/",
): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (/[\\:]/u.test(value)) return fallback;
  if (/[\u0000-\u001f]/u.test(value)) return fallback;
  return value;
}