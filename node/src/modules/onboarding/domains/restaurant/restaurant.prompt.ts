//restaurant.prompt.ts



export function buildRestaurantSummary(normalized: any) {
  const profile = normalized.domainProfile || {};
  const taxonomy = normalized.taxonomy || {};

  const parts = [
    profile.name ? `Restaurante chamado ${profile.name}` : 'Restaurante',
    taxonomy.subniche ? `do tipo ${taxonomy.subniche}` : '',
    taxonomy.services?.length
      ? `com foco em ${taxonomy.services.join(', ')}`
      : '',
    taxonomy.modules?.length
      ? `com módulos ativos: ${taxonomy.modules.join(', ')}`
      : '',
  ].filter(Boolean);

  return `${parts.join(', ')}.`;
}

export function buildRestaurantPersona(normalized: any) {
  const profile = normalized.domainProfile || {};

  return `Atendente virtual para restaurante${
    profile.subniche ? ` do tipo ${profile.subniche}` : ''
  }`;
}

export function buildRestaurantGuidelines(normalized: any, llmContext: any) {
  const languageInstruction: Record<string, string> = {
    pt: 'Responda sempre em português, a menos que o cliente peça outro idioma.',
    es: 'Responde siempre en español, a menos que el cliente pida otro idioma.',
    en: 'Always reply in English unless the customer asks for another language.',
  };

  const lang = normalized.language || 'pt';
  const profile = normalized.domainProfile || {};

  return `
Você é o assistente virtual oficial deste restaurante.

IDIOMA:
- ${languageInstruction[lang] || languageInstruction.pt}

REGRAS GERAIS:
- Use o CONTEXTO COMPLETO DO QUESTIONÁRIO como fonte principal.
- Considere sempre a pergunta e a resposta juntas.
- Responda de forma curta, clara e humana.
- Nunca invente preços, horários, promoções, disponibilidade, ingredientes ou políticas.
- Se não souber responder, diga que precisa confirmar com a equipe.
- Se o cliente pedir atendimento humano, encaminhe educadamente.

REGRAS PARA RESTAURANTE:
- Não prometa reserva, mesa, entrega, desconto ou disponibilidade sem confirmação.
- Informe alergias e restrições apenas com base nos dados cadastrados.
- Se houver pedido de entrega, confirme endereço, itens e forma de pagamento quando aplicável.
- Se houver reclamação, peça desculpas, colete dados e encaminhe para a equipe.

DADOS IMPORTANTES:
- Horários: ${profile.openingHours || 'não informado'}
- Localização: ${profile.location || 'não informado'}
- Área de entrega: ${profile.deliveryArea || 'não informado'}
- Formas de pagamento: ${
    Array.isArray(profile.paymentMethods) && profile.paymentMethods.length
      ? profile.paymentMethods.join(', ')
      : 'não informado'
  }
- O assistente nunca deve prometer/responder: ${
    profile.forbiddenAnswers || 'informações que não estejam cadastradas.'
  }

CONTEXTO COMPLETO:
${llmContext.questionAnswerText || ''}
`.trim();
}