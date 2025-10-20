// src/api/routes/botMessageRoutes.ts
import { Router, Request, Response } from 'express';
import Product, { IProduct } from '../../mongo/models/productModel';
import Message from '../../mongo/models/messageModel';
import ClientMemory from '../../mongo/models/clientMemoryModel';
import Bot from '../../mongo/models/botModel';
import Cliente from '../../mongo/models/clienteModel';
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
    // 0) Carregue o bot e descubra o dono
    const bot = await Bot.findById(botId).populate<{ product: IProduct | IProduct[] }>('product');
    if (!bot) return res.status(404).json({ error: 'Bot não encontrado' });

    const ownerUsername: string | undefined = (bot as any).owner;
    if (!ownerUsername) {
      return res.status(400).json({ error: 'Bot sem owner associado' });
    }

    // 1) Guard central (bloqueio + botsEnabled)
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

    // 2) Fluxo normal de geração de resposta
    const productDocs: IProduct[] = Array.isArray(bot.product)
      ? (bot.product as IProduct[])
      : ([bot.product] as IProduct[]);

    const productIds = productDocs.map((p) => p._id);
    const allProductNames = productDocs.map((p) => p.name);

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
        chatHistory.push({
          role: m.sender === 'Bot' ? 'assistant' : 'user',
          content: m.message || '',
        })
      );
    }

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
      {
        about: (bot as any).about,
        guidelines: (bot as any).guidelines,
      }
    );

    return res.status(200).json({ message: botResponse });
  } catch (error) {
    console.error('Erro ao gerar resposta do bot:', error);
    return res.status(500).json({ error: 'Erro ao gerar a resposta do bot' });
  }
});

export { router };
