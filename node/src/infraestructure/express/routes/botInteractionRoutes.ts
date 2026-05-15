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

function pickString(values: Record<string, any>, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = values?.[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return fallback;
}

function pickNumberNullable(values: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = values?.[key];

    if (value === undefined || value === null || value === '') continue;

    const numberValue = typeof value === 'number' ? value : Number(value);

    if (Number.isFinite(numberValue) && numberValue >= 0) {
      return numberValue;
    }
  }

  return null;
}

function productModelToLLMProduct(product: any): LLMProduct {
  return {
    id: product.id_external || String(product._id),
    category: product.category || 'geral',
    name: product.name || 'Item sem nome',
    description: product.description || '',
    price: product.price ?? product.price_eur ?? null,
    price_eur: product.price_eur ?? product.price ?? null,
    imageUrl: product.imageUrl ?? undefined,
  };
}

function catalogItemToLLMProduct(catalogItem: any): LLMProduct {
  const values = (catalogItem?.values || {}) as Record<string, any>;

  const name = pickString(
    values,
    ['title', 'name', 'nome', 'titulo', 'título'],
    `Item ${String(catalogItem?._id || '')}`
  );

  const description = pickString(
    values,
    ['description', 'descricao', 'descrição', 'descripcion'],
    ''
  );

  const category = pickString(
    values,
    ['category', 'categoria', 'type', 'tipo'],
    'geral'
  );

  const price = pickNumberNullable(
    values,
    ['price_eur', 'price', 'preco', 'preço', 'precio']
  );

  const imageUrl =
    Array.isArray(catalogItem.images) && catalogItem.images.length
      ? catalogItem.images[0]
      : typeof values.image === 'string'
        ? values.image
        : undefined;

  return {
    id: String(catalogItem._id),
    category,
    name,
    description,
    price,
    price_eur: price,
    imageUrl,
  };
}

function uniqueProductsById(products: LLMProduct[]) {
  const map = new Map<string, LLMProduct>();

  for (const product of products) {
    if (!product?.id) continue;
    map.set(String(product.id), product);
  }

  return Array.from(map.values());
}

function rankProductsByMessage(userMessage: string, products: LLMProduct[]) {
  return products
    .map((product) => ({
      product,
      score: fallbackScore(
        userMessage,
        product.name || '',
        product.description || ''
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.product);
}

async function getBotProducts(bot: any): Promise<LLMProduct[]> {
  const productDocs: IProduct[] = Array.isArray(bot.product)
    ? (bot.product as IProduct[])
    : bot.product
      ? ([bot.product] as IProduct[])
      : [];

  const productIds = productDocs
    .map((product: any) => product?._id)
    .filter(Boolean);

  let productsFromProductModel: LLMProduct[] = [];

  if (productIds.length > 0) {
    const rawProducts = await Product.find({
      _id: { $in: productIds },
    }).lean();

    productsFromProductModel = rawProducts.map(productModelToLLMProduct);
  }

  const catalogItemsArr = Array.isArray(bot.catalogItems)
    ? bot.catalogItems
    : [];

  const catalogItemIds = catalogItemsArr
    .map((item: any) => {
      if (typeof item === 'string') return item;
      return item?._id;
    })
    .filter(Boolean);

  let catalogItemsRaw: any[] = [];

  const hasOnlyIds = catalogItemsArr.some(
    (item: any) => typeof item === 'string'
  );

  if (hasOnlyIds && catalogItemIds.length > 0) {
    catalogItemsRaw = await CatalogItem.find({
      _id: { $in: catalogItemIds },
    }).lean();
  } else {
    catalogItemsRaw = catalogItemsArr;
  }

  const productsFromCatalog = catalogItemsRaw.map(catalogItemToLLMProduct);

  return uniqueProductsById([
    ...productsFromProductModel,
    ...productsFromCatalog,
  ]);
}

async function getRelevantProducts({
  userMessage,
  allProducts,
  bot,
}: {
  userMessage: string;
  allProducts: LLMProduct[];
  bot: any;
}) {
  const productDocs: IProduct[] = Array.isArray(bot.product)
    ? (bot.product as IProduct[])
    : bot.product
      ? ([bot.product] as IProduct[])
      : [];

  const productIds = productDocs
    .map((product: any) => product?._id)
    .filter(Boolean);

  const textQuery = buildTextSearchQuery(userMessage);

  let relevantFromProductModel: LLMProduct[] = [];

  if (textQuery && productIds.length > 0) {
    const foundProducts = await Product.find({
      _id: { $in: productIds },
      $text: { $search: textQuery },
    })
      .limit(5)
      .lean();

    relevantFromProductModel = foundProducts.map(productModelToLLMProduct);
  }

  const rankedFallback = rankProductsByMessage(userMessage, allProducts);

  return uniqueProductsById([
    ...relevantFromProductModel,
    ...rankedFallback,
  ]).slice(0, 5);
}

async function getChatHistory(roomId?: string): Promise<ChatHistoryItem[]> {
  if (!roomId) return [];

  const lastMessages = await Message.find({ roomId })
    .sort({ timestamp: -1 })
    .limit(8)
    .lean();

return lastMessages
  .reverse()
  .map((message: any): ChatHistoryItem => ({
    role: message.sender === 'Bot'
      ? ('assistant' as const)
      : ('user' as const),

    content: String(message.message || ''),
  }))
  .filter((message) => message.content);
}

async function getMemoryContext(clientId?: string): Promise<MemoryContext> {
  if (!clientId) return {};

  const memory = await ClientMemory.findOne({ clientId }).lean();

  if (!memory) return {};

  return {
    topics: (memory as any).topicsAgg ?? [],
    sentiment: (memory as any).sentimentAgg ?? 'neutral',
  };
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
    preferredLanguage?: 'pt' | 'es' | 'en' | 'it' | 'fr' | 'ar' | 'de';
  } = req.body;

  if (!userMessage || typeof userMessage !== 'string') {
    return res.status(400).json({
      error: 'userMessage é obrigatório.',
    });
  }

  try {
    const bot = await Bot.findById(botId)
      .populate<{ product: IProduct | IProduct[] }>('product')
      .populate('catalogItems');

    if (!bot) {
      return res.status(404).json({
        error: 'Bot não encontrado.',
      });
    }

    const ownerUsername = (bot as any).owner;

    if (!ownerUsername) {
      return res.status(400).json({
        error: 'Bot sem owner associado.',
      });
    }

    const guard = await canUserAutoRespond(ownerUsername);

    if (!guard.allow) {
      return res.status(423).json({
        error:
          guard.reason === 'BLOCKED'
            ? 'Conta do proprietário do bot está bloqueada.'
            : guard.reason === 'BOTS_OFF'
              ? 'Bots desativados pelo usuário.'
              : 'Proprietário não encontrado.',
      });
    }

    const allProducts = await getBotProducts(bot);
    const relevantProducts = await getRelevantProducts({
      userMessage,
      allProducts,
      bot,
    });

    const allProductNames = allProducts
      .map((product) => product.name)
      .filter(Boolean);

    const companyData: CompanyData = {
      name: (bot as any).companyName || 'Empresa',
      address: (bot as any).address || '',
      email: (bot as any).email || '',
      phone: (bot as any).phone || '',
    };

    const chatHistory = await getChatHistory(roomId);
    const memoryContext = await getMemoryContext(clientId);

    const botResponse = await generateBotResponse(
      (bot as any).name || 'Enki',
      (bot as any).persona || 'assistente virtual profissional e simpático',
      relevantProducts,
      allProducts,
      (bot as any).temperature ?? 0.5,
      userMessage,
      companyData,
      chatHistory,
      memoryContext,
      {
        preferredLanguage,
        userInputLanguage: detectLang(userMessage),
      },
      allProductNames,
      {
        about: (bot as any).about || '',
        guidelines: (bot as any).guidelines || '',
      }
    );

    return res.status(200).json({
      message: botResponse,
    });
  } catch (error) {
    console.error('[BOT_MESSAGE] erro:', error);

    return res.status(500).json({
      error: 'Erro ao gerar a resposta do bot.',
    });
  }
});

export { router };