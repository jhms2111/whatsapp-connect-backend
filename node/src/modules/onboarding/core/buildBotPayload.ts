//buildBotPayload.ts

import { getOnboardingDomain } from './registry';

export function buildBotPayload({
  normalized,
  llmContext,
  catalogItemIds = [],
  username,
}: {
  normalized: any;
  llmContext: any;
  catalogItemIds?: any[];
  username: string;
}) {
  const domainConfig = getOnboardingDomain(normalized.domain);

  const persona = domainConfig?.buildPersona
    ? domainConfig.buildPersona(normalized)
    : `Atendente virtual para ${normalized.domain || 'negócio'}`;

  const guidelines = domainConfig?.buildGuidelines
    ? domainConfig.buildGuidelines(normalized, llmContext)
    : buildDefaultGuidelines(normalized, llmContext);

  return {
    name: 'Enki',

    persona,

    about: buildAbout(llmContext),

    guidelines,

    temperature: 0.5,

    product: [],

    ...(catalogItemIds.length
      ? { catalogItems: catalogItemIds }
      : {}),

    companyName: normalized.account?.businessName || '',

    address:
      normalized.domainProfile?.location ||
      normalized.domainProfile?.address ||
      '',

    email: normalized.account?.email || '',

    phone:
      normalized.account?.phone ||
      normalized.domainProfile?.whatsapp ||
      '',

    owner: username,
  };
}

function buildAbout(llmContext: any) {
  return `
RESUMO DO NEGÓCIO:
${llmContext.summary || 'Nenhum resumo gerado.'}

CONTEXTO COMPLETO DO QUESTIONÁRIO:
${llmContext.questionAnswerText || 'Nenhuma resposta cadastrada.'}

DADOS ESTRUTURADOS:
${JSON.stringify(llmContext.structured || {}, null, 2)}
`.trim();
}

function buildDefaultGuidelines(normalized: any, llmContext: any) {
  const languageInstruction: Record<string, string> = {
    pt: 'Responda sempre em português, a menos que o cliente peça outro idioma.',
    es: 'Responde siempre en español, a menos que el cliente pida otro idioma.',
    en: 'Always reply in English unless the customer asks for another language.',
  };

  return `
Você é o assistente virtual oficial deste negócio.

IDIOMA:
- ${languageInstruction[normalized.language] || languageInstruction.pt}

REGRAS GERAIS:
- Use o CONTEXTO COMPLETO DO QUESTIONÁRIO como fonte principal.
- Considere sempre a pergunta e a resposta juntas.
- Use os DADOS ESTRUTURADOS como apoio.
- Seja educado, claro e humano.
- Responda em mensagens curtas.
- Nunca invente preços, horários, promoções, prazos, disponibilidade ou políticas.
- Se não souber responder, diga que precisa confirmar com a equipe.
- Se o cliente pedir atendimento humano, encaminhe educadamente.

CONTEXTO:
${llmContext.questionAnswerText || ''}
`.trim();
}