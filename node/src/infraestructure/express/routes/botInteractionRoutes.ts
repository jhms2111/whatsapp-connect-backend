// src/api/routes/botMessageRoutes.ts
import { Router, Request, Response } from 'express';
import Product, { IProduct } from '../../mongo/models/productModel';
import Message from '../../mongo/models/messageModel';
import ClientMemory from '../../mongo/models/clientMemoryModel';
import Bot from '../../mongo/models/botModel';
import {
  generateBotResponse,
  Product as LLMProduct,
  ChatHistoryItem,
  MemoryContext,
  detectLang,
} from '../../../modules/integration/Chatgpt/chatGptAdapter';
import { buildTextSearchQuery, fallbackScore } from '../../../utils/search';

const router = Router();

interface CompanyData {
  name: string;
  address: string;
  email: string;
  phone: string;
}

router.post('/bot/:botId/message', async (req: Request, res: Response) => {
  const { botId } = req.params;
  const {
    userMessage,
    clientId,
    roomId,
    preferredLanguage,
  }: {
    userMessage?: string;
    clientId?: string;
    roomId?: string;
    preferredLanguage?: 'pt' | 'es' | 'en' | 'it' | 'fr' | 'ar';
  } = req.body;

  if (!userMessage || typeof userMessage !== 'string') {
    return res.status(400).json({ error: 'userMessage é obrigatório' });
  }

  try {
    const bot = await Bot.findById(botId).populate<{ product: IProduct | IProduct[] }>('product');
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado' });

    const productDocs: IProduct[] = Array.isArray(bot.product)
      ? (bot.product as IProduct[])
      : ([bot.product] as IProduct[]);

    const productIds = productDocs.map((p) => p._id);
    const allProductNames = productDocs.map((p) => p.name);

    // monta allProducts no formato LLMProduct
    const allProductsRaw = await Product.find({ _id: { $in: productIds } }).lean();
    const allProducts: LLMProduct[] = allProductsRaw.map((p: any) => ({
      id: p.id_external || String(p._id),
      category: p.category || 'outros',
      name: p.name,
      description: p.description,
      price: p.price ?? 0,
      price_eur: p.price_eur ?? null,
      allergens: p.allergens ?? [],
      contains_pork: !!p.contains_pork,
      spicy: !!p.spicy,
      vegetarian: !!p.vegetarian,
      vegan: !!p.vegan,
      pregnancy_unsuitable: !!p.pregnancy_unsuitable,
      recommended_alcoholic: p.recommended_alcoholic ?? null,
      recommended_non_alcoholic: p.recommended_non_alcoholic ?? null,
      notes: p.notes ?? null,
      isTakeaway: !!p.isTakeaway,
      takeawayLink: p.takeawayLink ?? undefined,
      imageUrl: p.imageUrl ?? undefined,
    }));

    // busca relevantes
    const textQuery = buildTextSearchQuery(userMessage);
    let relevantRaw = await Product.find({
      _id: { $in: productIds },
      ...(textQuery ? { $text: { $search: textQuery } } : {}),
    })
      .limit(5)
      .lean();

    if (!relevantRaw.length) {
      relevantRaw = allProductsRaw
        .map((p: any) => ({
          ...p,
          __score: fallbackScore(userMessage, p.name, p.description),
        }))
        .sort((a, b) => b.__score - a.__score)
        .slice(0, 5);
    }

    const adapterProducts: LLMProduct[] = relevantRaw.map((p: any) => ({
      id: p.id_external || String(p._id),
      category: p.category || 'outros',
      name: p.name,
      description: p.description,
      price: p.price ?? 0,
      price_eur: p.price_eur ?? null,
      allergens: p.allergens ?? [],
      contains_pork: !!p.contains_pork,
      spicy: !!p.spicy,
      vegetarian: !!p.vegetarian,
      vegan: !!p.vegan,
      pregnancy_unsuitable: !!p.pregnancy_unsuitable,
      recommended_alcoholic: p.recommended_alcoholic ?? null,
      recommended_non_alcoholic: p.recommended_non_alcoholic ?? null,
      notes: p.notes ?? null,
      imageUrl: p.imageUrl ?? undefined,
    }));

    // empresa
    const companyData: CompanyData = {
      name: bot.companyName ?? 'Empresa Genérica',
      address: bot.address ?? 'Endereço não informado',
      email: bot.email ?? 'email@empresa.com',
      phone: bot.phone ?? '(00) 00000-0000',
    };

    // histórico
    const chatHistory: ChatHistoryItem[] = [];
    if (roomId) {
      const lastMsgs = await Message.find({ roomId }).sort({ timestamp: -1 }).limit(1).lean();
      lastMsgs.reverse().forEach((m) =>
        chatHistory.push({
          role: m.sender === 'Bot' ? 'assistant' : 'user',
          content: m.message || '',
        })
      );
    }

    // memória
    let memoryCtx: MemoryContext = {};
    if (clientId) {
      const mem = await ClientMemory.findOne({ clientId }).lean();
      if (mem) {
        memoryCtx = {
          topics: mem.topicsAgg ?? [],
          sentiment: mem.sentimentAgg ?? 'neutral',
        };
      }
    }

    // fallback sem relevantes
    if (adapterProducts.length === 0) {
      const langGuess = detectLang(userMessage);
      type LangKey = 'pt' | 'es' | 'en' | 'it' | 'fr' | 'ar';
      const top3 = allProductNames.slice(0, 3);

      const msgByLang: Record<LangKey, string> = {
        pt: `Não temos esse item. Disponíveis: ${top3.join(', ')}.`,
        es: `No tenemos ese ítem. Disponibles: ${top3.join(', ')}.`,
        en: `We don't have that item. Available: ${top3.join(', ')}.`,
        it: `Non abbiamo quell'articolo. Disponibili: ${top3.join(', ')}.`,
        fr: `Nous n'avons pas cet article. Disponibles : ${top3.join(', ')}.`,
        ar: `هذا الصنف غير متوفر. المتاح: ${top3.join(', ')}.`,
      };

      const out = msgByLang[(langGuess ?? 'pt') as LangKey];
      return res.status(200).json({ message: out });
    }

const botResponse = await generateBotResponse(
  bot.name ?? 'Enki',
  bot.persona ?? 'simples e simpática',
  adapterProducts,
  allProducts,
  bot.temperature ?? 0.5,
  userMessage,
  companyData,
  chatHistory,
  memoryCtx,
  { preferredLanguage, userInputLanguage: detectLang(userMessage) },
  allProductNames,
  {
    about: bot.about,
    guidelines: bot.guidelines,
  }
);



    return res.status(200).json({ message: botResponse });
  } catch (error) {
    console.error('Erro ao gerar resposta do bot:', error);
    return res.status(500).json({ error: 'Erro ao gerar a resposta do bot' });
  }
});

export { router };

