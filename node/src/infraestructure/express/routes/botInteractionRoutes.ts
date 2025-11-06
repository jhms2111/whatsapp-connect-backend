// src/api/routes/botMessageRoutes.ts
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Product, { IProduct } from '../../mongo/models/productModel';
import Message from '../../mongo/models/messageModel';
import ClientMemory from '../../mongo/models/clientMemoryModel';
import Bot from '../../mongo/models/botModel';
import CatalogItem from '../../mongo/models/catalogItemModel';
import {
  generateBotResponse,
  Product as LLMProduct,
  ChatHistoryItem,
  MemoryContext,
  detectLang,
} from '../../../modules/integration/Chatgpt/chatGptAdapter';
import { buildTextSearchQuery, fallbackScore } from '../../../utils/search';
import { canUserAutoRespond } from '../../../utils/botsGuards';

const router = Router();

interface CompanyData {
  name: string;
  address: string;
  email: string;
  phone: string;
}

/** ========= Helpers CatalogItem -> LLMProduct ========= */
function pickStr(values: Record<string, any>, keys: string[], fallback = '') {
  for (const k of keys) {
    const v = values?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return fallback;
}
function pickNum(values: Record<string, any>, keys: string[], fallback = 0) {
  for (const k of keys) {
    const v = values?.[k];
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
function catalogItemToLLMProduct(ci: any): LLMProduct {
  const v = (ci?.values || {}) as Record<string, any>;
  const name = pickStr(v, ['title', 'name', 'nome', 'título', 'titulo'], `#${ci?._id}`);
  const description = pickStr(v, ['description', 'descrição', 'descricao', 'descripcion'], '');
  const category = pickStr(v, ['category', 'categoria', 'tipo'], 'outros');
  const price = pickNum(v, ['price', 'preço', 'preco', 'price_eur'], 0);
  const price_eur = Number.isFinite(v?.price_eur) ? Number(v.price_eur) : undefined;
  const allergens = Array.isArray(v.allergens) ? v.allergens : [];
  const contains_pork = !!(v.contains_pork ?? v.porco);
  const spicy = !!(v.spicy ?? v.picante);
  const vegetarian = !!(v.vegetarian ?? v.vegetariano);
  const vegan = !!(v.vegan ?? v.vegano);
  const pregnancy_unsuitable = !!(v.pregnancy_unsuitable ?? v.gravidas_nao_recomendado);
  const imageUrl =
    Array.isArray(ci.images) && ci.images.length
      ? ci.images[0]
      : typeof v.image === 'string'
      ? v.image
      : undefined;

  return {
    id: String(ci._id),
    category,
    name,
    description,
    price,
    price_eur: typeof price_eur === 'number' ? price_eur : null,
    allergens,
    contains_pork,
    spicy,
    vegetarian,
    vegan,
    pregnancy_unsuitable,
    recommended_alcoholic: v.recommended_alcoholic ?? null,
    recommended_non_alcoholic: v.recommended_non_alcoholic ?? null,
    notes: v.notes ?? null,
    imageUrl,
  };
}
/** ===================================================== */

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
    const bot = await Bot.findById(botId)
      .populate<{ product: IProduct | IProduct[] }>('product')
      .populate('catalogItems'); // 👈 essencial
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado' });

    const ownerUsername: string | undefined = (bot as any).owner;
    if (!ownerUsername) return res.status(400).json({ error: 'Bot sem owner associado' });

    const check = await canUserAutoRespond(ownerUsername);
    if (!check.allow) {
      return res.status(423).json({
        error:
          check.reason === 'BLOCKED'
            ? 'Conta do proprietário do bot está bloqueada'
            : check.reason === 'BOTS_OFF'
            ? 'Bots desativados pelo usuário'
            : 'Proprietário não encontrado',
      });
    }

    // Products
    const productDocs: IProduct[] = Array.isArray(bot.product)
      ? (bot.product as IProduct[])
      : ([bot.product] as IProduct[]);
    const productIds = productDocs.map((p) => p._id);
    const allProductsRaw = await Product.find({ _id: { $in: productIds } }).lean();
    const allProductsFromProduct: LLMProduct[] = allProductsRaw.map((p: any) => ({
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

    // CatalogItems (aceita populado ou ids)
    const catalogItemsArr = Array.isArray((bot as any).catalogItems) ? (bot as any).catalogItems : [];
    const catalogItemIds = catalogItemsArr.map((ci: any) => (typeof ci === 'string' ? ci : ci?._id)).filter(Boolean);
    let catalogItemsRaw: any[] = [];
    if (catalogItemsArr.some((ci: any) => typeof ci === 'string')) {
      catalogItemsRaw = await CatalogItem.find({ _id: { $in: catalogItemIds } }).lean();
    } else {
      catalogItemsRaw = catalogItemsArr as any[];
    }
    const allProductsFromCatalog: LLMProduct[] = catalogItemsRaw.map(catalogItemToLLMProduct);

    // MERGE
    const allProducts: LLMProduct[] = [...allProductsFromProduct, ...allProductsFromCatalog];
    const allProductNames = allProducts.map((p) => p.name);

    // 🔎 DEBUG
    console.log('[BOTMSG] total products:', allProductsFromProduct.length);
    console.log('[BOTMSG] total catalog items:', allProductsFromCatalog.length);
    console.log('[BOTMSG] merged allProducts:', allProducts.length);

    // Relevantes (Products via $text + Catálogo via score)
    const textQuery = buildTextSearchQuery(userMessage);
    let relevantFromProducts: any[] = [];
    if (textQuery) {
      relevantFromProducts = await Product.find({
        _id: { $in: productIds },
        $text: { $search: textQuery },
      })
        .limit(5)
        .lean();
    }
    if (!relevantFromProducts.length) {
      relevantFromProducts = allProductsRaw
        .map((p: any) => ({ ...p, __score: fallbackScore(userMessage, p.name, p.description) }))
        .sort((a, b) => b.__score - a.__score)
        .slice(0, 5);
    }
    const mappedRelevantFromProducts: LLMProduct[] = relevantFromProducts.map((p: any) => ({
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

    const rankedCatalog = allProductsFromCatalog
      .map((ci) => ({ ci, __score: fallbackScore(userMessage, ci.name, ci.description) }))
      .sort((a, b) => b.__score - a.__score)
      .map((x) => x.ci);

    // Se pouco relevante dos products, completa com catálogo
    const adapterProducts: LLMProduct[] = [...mappedRelevantFromProducts, ...rankedCatalog].slice(0, 5);

    // 🔎 DEBUG
    console.log('[BOTMSG] adapterProducts (names):', adapterProducts.map((p) => p.name));

    const companyData: CompanyData = {
      name: (bot as any).companyName ?? 'Empresa Genérica',
      address: (bot as any).address ?? 'Endereço não informado',
      email: (bot as any).email ?? 'email@empresa.com',
      phone: (bot as any).phone ?? '(00) 00000-0000',
    };

    const chatHistory: ChatHistoryItem[] = [];
    if (roomId) {
      const lastMsgs = await Message.find({ roomId }).sort({ timestamp: -1 }).limit(1).lean();
      lastMsgs.reverse().forEach((m) =>
        chatHistory.push({ role: m.sender === 'Bot' ? 'assistant' : 'user', content: m.message || '' })
      );
    }

    let memoryCtx: MemoryContext = {};
    if (clientId) {
      const mem = await ClientMemory.findOne({ clientId }).lean();
      if (mem) {
        memoryCtx = { topics: mem.topicsAgg ?? [], sentiment: mem.sentimentAgg ?? 'neutral' };
      }
    }

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
      return res.status(200).json({ message: msgByLang[(langGuess ?? 'pt') as LangKey] });
    }

    // 🔎 DEBUG — O QUE ESTAMOS ENVIANDO AO OPENAI
    console.log('[BOTMSG] calling OpenAI with:', {
      adapterProducts: adapterProducts.map((p) => ({ id: p.id, name: p.name })),
      allProductsCount: allProducts.length,
    });

    const botResponse = await generateBotResponse(
      (bot as any).name ?? 'Enki',
      (bot as any).persona ?? 'simples e simpática',
      adapterProducts,
      allProducts,
      (bot as any).temperature ?? 0.5,
      userMessage,
      companyData,
      chatHistory,
      memoryCtx,
      { preferredLanguage, userInputLanguage: detectLang(userMessage) },
      allProductNames,
      { about: (bot as any).about, guidelines: (bot as any).guidelines }
    );

    return res.status(200).json({ message: botResponse });
  } catch (error) {
    console.error('Erro ao gerar resposta do bot:', error);
    return res.status(500).json({ error: 'Erro ao gerar a resposta do bot' });
  }
});

export { router };



