export function normalizePtBR(s: string) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const STOPWORDS = new Set([
  'de','da','do','das','dos','para','pra','em','no','na','o','a','e','ou',
  'um','uma','que','com','por','se','os','as'
]);

export function buildTextSearchQuery(userInput: string) {
  const terms = normalizePtBR(userInput)
    .split(/\W+/)
    .filter(t => t && !STOPWORDS.has(t));
  return terms.map(t => `"${t}"`).join(' ');
}

export function compact(text: string, max = 180) {
  if (!text) return '';
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

export function fallbackScore(query: string, name: string, description: string) {
  const q = normalizePtBR(query);
  const tks = q.split(/\s+/).filter(Boolean);
  const n = normalizePtBR(name);
  const d = normalizePtBR(description || '');
  let score = 0;
  if (n.includes(q)) score += 10;
  for (const w of tks) {
    if (n.includes(w)) score += 2;
    if (d.includes(w)) score += 1;
  }
  return score;
}
