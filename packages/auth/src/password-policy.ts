/**
 * Shared password policy, enforced on sign-up (and password reset) server-side
 * via a better-auth before-hook and mirrored client-side for instant feedback.
 * Pure module — no runtime imports — so it is safe to import from the browser.
 */

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

/** A short blocklist of trivially guessable passwords that no composition
 *  rule would catch. Expanded from real breach data (Top 100k). */
const COMMON_PASSWORDS = new Set([
  "123456", "password", "123456789", "12345678", "12345", "111111", "1234567",
  "sunshine", "qwerty", "iloveyou", "princess", "admin", "welcome", "monkey",
  "login", "abc123", "starwars", "123123", "dragon", "passw0rd", "master",
  "hello", "freedom", "whatever", "qazwsx", "trustno1", "letmein", "000000",
  "password1", "qwerty123", "1q2w3e4r", "123qwe", "zaq12wsx", "google",
  "facebook", "michelle", "lovely", "friends", "angel1", "secret", "summer1",
  "buster", "corvette", "tigger", "cheese", "batman", "hannah", "harley",
  "robert", "samantha", "daniel", "ashley", "michael", "jessica", "loveme1",
  "amanda", "pokemon", "basketball", "hockey", "soccer", "mickey", "charley",
]);

export type PasswordContext = {
  email?: string | null;
  name?: string | null;
};

/** Returns a human-readable reason when the password is weak, else null. */
export function checkPasswordStrength(
  password: string,
  context: PasswordContext = {},
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  if (password.length > MAX_PASSWORD_LENGTH)
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;

  if (!/[a-z]/u.test(password))
    return "Password must contain at least one lowercase letter";
  if (!/[A-Z]/u.test(password))
    return "Password must contain at least one uppercase letter";
  if (!/[0-9]/u.test(password))
    return "Password must contain at least one number";
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/u.test(password))
    return "Password must contain at least one symbol";

  if (COMMON_PASSWORDS.has(password.toLowerCase()))
    return "This password is too common. Choose something harder to guess";

  const lower = password.toLowerCase();
  const parts = [
    context?.email?.split("@")[0]?.toLowerCase(),
    context?.name?.toLowerCase(),
  ].filter((p): p is string => !!p && p.length >= 3);
  for (const part of parts) {
    if (lower.includes(part))
      return "Password must not contain your email or name";
  }

  return null;
}

/** Shared zod-compatible predicate for client-side forms. */
export function isStrongPassword(password: string): boolean {
  return checkPasswordStrength(password) === null;
}