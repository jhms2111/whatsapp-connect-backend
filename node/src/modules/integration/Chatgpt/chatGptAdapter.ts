import { OpenAI } from 'openai';
import { compact } from '../../../utils/search';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export interface Product {
  id: string;
  category?: string;
  name: string;
  description: string;
  price?: number | null;
  price_eur?: number | null;
  imageUrl?: string;

  // Campos antigos mantidos como opcionais para não quebrar Twilio e fluxos existentes
  allergens?: string[];
  contains_pork?: boolean;
  spicy?: boolean;
  vegetarian?: boolean;
  vegan?: boolean;
  pregnancy_unsuitable?: boolean;
  recommended_alcoholic?: string | null;
  recommended_non_alcoholic?: string | null;
  notes?: string | null;
}

export interface CompanyData {
  name: string;
  address?: string;
  email?: string;
  phone?: string;
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
  about?: string;
  guidelines?: string;
}

export function detectLang(text: string): LangPrefs['userInputLanguage'] {
  if (/[ء-ي]/.test(text)) return 'ar';

  const t = (text || '').toLowerCase();

  if (/\b(el|la|los|las|que|hola|precio|gracias|por favor)\b/.test(t)) return 'es';
  if (/\b(olá|ola|preço|preco|obrigado|obrigada|por favor)\b/.test(t)) return 'pt';
  if (/\b(the|and|with|please|price|hello|hi|thanks)\b/.test(t)) return 'en';
  if (/\b(il|gli|per|prezzo|ciao|grazie)\b/.test(t)) return 'it';
  if (/\b(le|les|avec|prix|bonjour|merci)\b/.test(t)) return 'fr';
  if (/\b(das|und|mit|bitte|preis|hallo|danke)\b/.test(t)) return 'de';

  return 'pt';
}

function getProductPrice(product: Product) {
  const price =
    product.price_eur !== undefined && product.price_eur !== null
      ? product.price_eur
      : product.price;

  if (price === undefined || price === null || Number.isNaN(Number(price))) {
    return null;
  }

  return Number(price);
}

function buildRelevantProductsBlock(products: Product[]) {
  if (!Array.isArray(products) || products.length === 0) return '—';

  return products
    .map((product) => {
      const price = getProductPrice(product);

      return `
${product.name}
${compact(product.description || '', 180)}
${price !== null ? `Preço: € ${price.toFixed(2)}` : 'Preço: não informado'}
`.trim();
    })
    .join('\n\n');
}

function buildFullProductsBlock(products: Product[]) {
  if (!Array.isArray(products) || products.length === 0) return '—';

  return products
    .map((product) => {
      const price = getProductPrice(product);

      return `
- ${product.name}
  Categoria: ${product.category || 'não informada'}
  Descrição: ${product.description || 'não informada'}
  Preço: ${price !== null ? `€ ${price.toFixed(2)}` : 'não informado'}
`.trim();
    })
    .join('\n');
}

function buildCompanyBlock(companyData: CompanyData) {
  return `
- Nome: ${companyData.name || 'não informado'}
- Endereço: ${companyData.address || 'não informado'}
- Email: ${companyData.email || 'não informado'}
- Telefone: ${companyData.phone || 'não informado'}
`.trim();
}

function buildMemoryBlock(memory: MemoryContext) {
  return `
- Tópicos anteriores: ${
    Array.isArray(memory.topics) && memory.topics.length
      ? memory.topics.join(', ')
      : '—'
  }
- Sentimento: ${memory.sentiment || 'neutral'}
`.trim();
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
  const detectedFromLatest = lang.userInputLanguage || detectLang(userInput);
  const preferredLanguage = lang.preferredLanguage || detectedFromLatest || 'pt';

  const allowedNames = allowedProductNames.length
    ? allowedProductNames.join(', ')
    : allProducts.map((product) => product.name).filter(Boolean).join(', ');

  const systemPrompt = `
Você é ${botName}.
Persona: ${persona}

IDIOMA:
- Responda no idioma da última mensagem do cliente.
- Se estiver ambíguo, responda em: ${preferredLanguage}.
- Não misture idiomas na mesma resposta.
- Mantenha nomes de produtos, serviços e marcas exatamente como cadastrados.

INFORMAÇÕES DO NEGÓCIO:
${extras.about || '—'}

REGRAS DO ASSISTENTE:
${extras.guidelines || '—'}

DADOS DA EMPRESA:
${buildCompanyBlock(companyData)}

CONTEXTO DO CLIENTE:
${buildMemoryBlock(memory)}

PRODUTOS/SERVIÇOS MAIS RELEVANTES PARA ESTA PERGUNTA:
${buildRelevantProductsBlock(relevantProducts)}

CATÁLOGO COMPLETO DISPONÍVEL:
${buildFullProductsBlock(allProducts)}

NOMES PERMITIDOS DE PRODUTOS/SERVIÇOS:
${allowedNames || '—'}

REGRAS FINAIS:
- Use apenas as informações acima.
- Não invente preço, horário, promoção, disponibilidade, política, prazo ou condição.
- Se a informação não estiver disponível, diga que precisa confirmar com a equipe.
- Responda de forma curta, clara e humana.
- Quando fizer sentido, termine com uma pergunta simples para continuar a conversa.
`.trim();

  const trimmedHistory = history.slice(-8);

  const messages = [
    {
      role: 'system' as const,
      content: systemPrompt,
    },
    ...trimmedHistory.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    {
      role: 'user' as const,
      content: userInput,
    },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: Math.min(Number(temperature) || 0.5, 0.7),
    max_tokens: 700,
  });

  return response.choices?.[0]?.message?.content || '';
};