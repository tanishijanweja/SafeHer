export function normalizePhone(value: string): string {
  return value.replace(/[\s().-]/g, "").trim();
}

export function isValidPhone(value: string): boolean {
  return /^\+?\d{10,15}$/.test(normalizePhone(value));
}
