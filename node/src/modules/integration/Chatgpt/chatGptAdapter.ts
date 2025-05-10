// src/modules/integration/Chatgpt/chatGptAdapter.ts
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

interface Product {
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

export const generateBotResponse = async (
  botName: string,
  persona: string,
  products: Product[],
  temperature: number,
  userInput: string,
  companyData: CompanyData
): Promise<string> => {
  const productDescriptions = products.map((p) => `
📦 Produto: ${p.name}
📃 Descrição: ${p.description}
💰 Preço: de R$ ${p.priceMin} até R$ ${p.priceMax}
`).join('\n');

  const prompt = `
🧠 Contexto da empresa:
🏢 Empresa: ${companyData.name}
📍 Endereço: ${companyData.address}
📧 E-mail: ${companyData.email}
📞 Telefone: ${companyData.phone}

🛒 Produtos disponíveis:
${productDescriptions}

⚠️ Instruções:
- Não fale de preço se o cliente não perguntar.
- Seja simpático, objetivo e humano.
- Use técnicas de persuasão.

🗣️ Cliente: "${userInput}"

Responda como ${botName}, com personalidade: ${persona}.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: userInput },
    ],
    temperature,
    max_tokens: 400,
  });

  if (!response.choices[0].message.content) {
    throw new Error('A resposta do GPT veio vazia.');
  }
  return response.choices[0].message.content;
  
};
