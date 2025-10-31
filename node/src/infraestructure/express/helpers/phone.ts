export function normalizeE164(raw: string): string | null {
  const t = String(raw || '').replace(/[^\d+]/g, '');
  if (!t.startsWith('+') || t.length < 8) return null;
  return t;
}
