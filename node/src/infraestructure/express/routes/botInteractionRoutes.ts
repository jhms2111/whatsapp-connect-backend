import { Router, Request, Response } from 'express';
import { generateBotResponse } from '../../../modules/integration/Chatgpt/chatGptAdapter';
import Bot from '../../mongo/models/botModel';
import { Types } from 'mongoose';

const router = Router();

interface Product {
  _id: Types.ObjectId;
  name: string;
  description: string;
  priceMin: number;
  priceMax: number;
}

interface CompanyData {
  name: string;
  address: string;
  email: string;
  phone: string;
}

router.post('/bot/:botId/message', async (req: Request, res: Response) => {
  const { botId } = req.params;
  const { userMessage } = req.body;

  try {
    const bot = await Bot.findById(botId).populate('product');

    if (!bot) {
      return res.status(404).json({ error: 'Bot não encontrado' });
    }

    if (!bot.product || (Array.isArray(bot.product) && bot.product.length === 0)) {
      return res.status(400).json({ error: 'Nenhum produto vinculado a este bot.' });
    }

    // 💡 Aqui convertemos o array para o tipo certo de forma segura
    const populatedProducts = (Array.isArray(bot.product) ? bot.product : [bot.product]) as unknown as Product[];

    const companyData: CompanyData = {
      name: bot.companyName ?? 'Empresa Genérica',
      address: bot.address ?? 'Endereço não informado',
      email: bot.email ?? 'email@empresa.com',
      phone: bot.phone ?? '(00) 00000-0000',
    };

    const botResponse = await generateBotResponse(
      bot.name ?? 'Enki',
      bot.persona ?? 'simples e simpática',
      populatedProducts,
      bot.temperature ?? 0.5,
      userMessage,
      companyData
    );

    res.status(200).json({ message: botResponse });
  } catch (error) {
    console.error('Erro ao gerar resposta do bot:', error);
    res.status(500).json({ error: 'Erro ao gerar a resposta do bot' });
  }
});

export { router };
