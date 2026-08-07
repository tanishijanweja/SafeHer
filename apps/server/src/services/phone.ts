import { z } from "zod";

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s().-]/g, "").trim();
}

export function isValidPhone(value: string): boolean {
  return /^\+?\d{10,15}$/.test(normalizePhone(value));
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .refine((value) => isValidPhone(value), {
    message: "Enter a valid phone number (10-15 digits)",
  });
