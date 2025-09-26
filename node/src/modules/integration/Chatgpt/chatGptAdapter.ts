import { OpenAI } from 'openai';
import { compact } from '../../../utils/search';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface Product {
  id: string;
  category: string;
  name: string;
  description: string;
  price: number;
  price_eur?: number | null;
  allergens: string[];
  contains_pork: boolean;
  spicy: boolean;
  vegetarian: boolean;
  vegan: boolean;
  pregnancy_unsuitable: boolean;
  recommended_alcoholic?: string | null;
  recommended_non_alcoholic?: string | null;
  notes?: string | null;
  imageUrl?: string;
}

export interface CompanyData {
  name: string;
  address: string;
  email: string;
  phone: string;
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface MemoryContext {
  topics?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface LangPrefs {
  preferredLanguage?: 'pt' | 'es' | 'en' | 'it' | 'fr' | 'ar' | 'de';
  userInputLanguage?: 'pt' | 'es' | 'en' | 'it' | 'fr' | 'ar' | 'de';
}

export interface ExtraInstructions {
  guidelines?: string;
  about?: string;
}

/**
 * Simple language detection (reduced false positives).
 */
export function detectLang(text: string): LangPrefs['userInputLanguage'] {
  if (/[ء-ي]/.test(text)) return 'ar';
  const t = (text || '').toLowerCase();
  if (/\b(el|la|los|las|que)\b/.test(t)) return 'es';
  if (/\b(the|and|with|please|price|hello|hi)\b/.test(t)) return 'en';
  if (/\b(il|la|gli|le|per|prezzo|ciao)\b/.test(t)) return 'it';
  if (/\b(le|la|les|avec|prix|bonjour|s'il vous plaît)\b/.test(t)) return 'fr';
  if (/\b(ola|olá|por favor|preço|preco)\b/.test(t)) return 'pt';
  if (/\b(das|und|mit|bitte|preis|hallo|hi)\b/.test(t)) return 'de';
  return 'en'; // safe default
}

export const generateBotResponse = async (
  botName: string,
  persona: string,
  relevantProducts: Product[],
  allProducts: Product[],
  temperature: number,
  userInput: string,
  companyData: CompanyData,
  history: ChatHistoryItem[] = [],
  memory: MemoryContext = {},
  lang: LangPrefs = {},
  allowedProductNames: string[] = [],
  extras: ExtraInstructions = {}
): Promise<string> => {
  const allowedNames = allowedProductNames.length
    ? allowedProductNames.join(', ')
    : allProducts.map((p) => p.name).join(', ');

  // Short details of relevant products
  const relevantBlock = relevantProducts
    .map(
      (p) => `
${p.name}
${compact(p.description, 120)}
€ ${Number(p.price).toFixed(2)}
`
    )
    .join('\n\n');

  // Full detailed menu (labels in EN)
  const allBlock = allProducts
    .map(
      (p) => `
- ${p.name} (${p.category})
  Description: ${p.description}
  Price: € ${Number(p.price).toFixed(2)}
  Allergens: ${p.allergens?.join(', ') || 'none'}
  Contains pork: ${p.contains_pork ? 'yes' : 'no'}
  Vegan: ${p.vegan ? 'yes' : 'no'}
  Vegetarian: ${p.vegetarian ? 'yes' : 'no'}
  Spicy: ${p.spicy ? 'yes' : 'no'}
  Pregnancy: ${p.pregnancy_unsuitable ? 'not recommended' : 'ok'}
  Alcoholic pairing: ${p.recommended_alcoholic ?? '—'}
  Non-alcoholic pairing: ${p.recommended_non_alcoholic ?? '—'}
  Notes: ${p.notes ?? '—'}
`
    )
    .join('\n');

  const memoryBlock = `
Customer context:
- Topics: ${Array.isArray(memory.topics) && memory.topics.length ? memory.topics.join(', ') : '—'}
- Sentiment: ${memory.sentiment ?? 'neutral'}
`.trim();

  // LANGUAGE: detect only from latest user input; fallback = English
  const detectedFromLatest = lang.userInputLanguage ?? detectLang(userInput);
  const preferred = lang.preferredLanguage ?? detectedFromLatest ?? 'en';

  const isFirstTurn = history.length === 0;

  const languageInstruction = `
Always respond in the language detected from the user's latest message only.
Do NOT use product/menu/company data or previous messages to determine language.
If the user requests "english" or writes in English, respond in English.
If languages are mixed, prioritize "${preferred}".
Supported languages: Português, Español, English, Italiano, Français, العربية, Deutsch.
`.trim();

  const conversationFlow = isFirstTurn
    ? `
First message policy (first turn only):
- Begin with: "Which language can I answer you in?"
- After the customer replies with a language, send (translated into the same language):
  "Welcome! I am here to help with product recommendations and information about our services."
- Do NOT show best sellers in the very first message.
`.trim()
    : `
On subsequent turns:
- Do NOT show best sellers unless the customer asks for recommendations or suggestions.
`.trim();

  const systemPrompt = `
You are ${botName}, persona: ${persona}.
${extras.about ? `\n### About the company\n${extras.about}` : ''}
${extras.guidelines ? `\n### Additional instructions\n${extras.guidelines}` : ''}

### Language
${languageInstruction}

### Conversation flow
${conversationFlow}

Allowed product names: ${allowedNames || '—'}

### Company data
- Company: ${companyData.name}
- Address: ${companyData.address}
- E-mail: ${companyData.email}
- Phone: ${companyData.phone}

${memoryBlock}

### Relevant products
${relevantBlock || '—'}

### Full menu
${allBlock || '—'}
`.trim();

  const hardLangGuard = `
Language policy (must follow, no exceptions):
- Determine reply language ONLY from the user's most recent message (this turn).
- NEVER include text in any other language within the same reply.
- Do not infer language from menu/catalog/company data or previous messages.
- If ambiguity, reply in "${preferred}".
- Keep product names as-is; all other text must be in the chosen language.
`.trim();

  const trimmedHistory = history.slice(-6);

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'system' as const, content: hardLangGuard },
    ...trimmedHistory.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: userInput },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: Math.min(temperature, 0.7),
    max_tokens: 800,
  });

  return response.choices?.[0]?.message?.content || '';
};
