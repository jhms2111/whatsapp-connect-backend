export function normalizeE164(raw: string) {
  // simples: remove tudo que não é dígito e adiciona + se começar com país (assumindo internacional)
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  // se já vier com DDI, prefixa '+'
  return digits.startsWith('0') ? `+${digits.replace(/^0+/, '')}` : `+${digits}`;
}
