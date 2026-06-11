function formatList(value: any) {
  if (!Array.isArray(value) || value.length === 0) return 'não informado';
  return value.join(', ');
}

function formatDebtors(debtors: any[] = []) {
  if (!Array.isArray(debtors) || debtors.length === 0) {
    return 'Nenhuma cobrança cadastrada.';
  }

  return debtors
    .map((debtor, index) => {
      return `
COBRANÇA ${index + 1}:
- Nome do devedor: ${debtor.debtorName || 'não informado'}
- Referência/documento: ${debtor.documentReference || 'não informado'}
- Valor da dívida: ${debtor.debtAmount || 'não informado'}
- Vencimento: ${debtor.dueDate || 'não informado'}
- Origem da dívida: ${debtor.debtOrigin || 'não informado'}
- Formas de pagamento: ${formatList(debtor.paymentMethods)}
- Máximo de parcelas: ${debtor.maxInstallments || 'não informado'}
- Juros/encargos: ${debtor.interestPolicy || 'não informado'}
- Desconto permitido: ${debtor.discountPolicy || 'não informado'}
- Observações de negociação: ${debtor.negotiationNotes || 'não informado'}
- Email cadastrado do devedor: ${debtor.debtorEmail || 'não informado'}
`.trim();
    })
    .join('\n\n');
}

export function buildDebtCollectionSummary(normalized: any) {
  const profile = normalized.domainProfile || {};
  const debtors = profile.debtors || [];

  const parts = [
    profile.companyName
      ? `Operação de cobrança para ${profile.companyName}`
      : 'Operação de cobrança',
    profile.businessType ? `tipo ${profile.businessType}` : '',
    profile.debtTypes?.length
      ? `dívidas tratadas: ${profile.debtTypes.join(', ')}`
      : '',
    debtors.length
      ? `${debtors.length} cobrança(s) cadastrada(s)`
      : '',
  ].filter(Boolean);

  return `${parts.join(', ')}.`;
}

export function buildDebtCollectionPersona(normalized: any) {
  const profile = normalized.domainProfile || {};

  return `Funcionário digital especializado em cobrança e negociação${
    profile.agentTone ? ` com tom ${profile.agentTone}` : ''
  }`;
}

export function buildDebtCollectionGuidelines(normalized: any, llmContext: any) {
  const languageInstruction: Record<string, string> = {
    pt: 'Responda sempre em português, a menos que o devedor peça outro idioma.',
    es: 'Responde siempre en español, a menos que el deudor pida otro idioma.',
    en: 'Always reply in English unless the debtor asks for another language.',
  };

  const lang = normalized.language || 'pt';
  const profile = normalized.domainProfile || {};

  return `
Você é o assistente virtual oficial de cobrança deste negócio.

IDIOMA:
- ${languageInstruction[lang] || languageInstruction.pt}

MISSÃO:
- Conversar com devedores de forma educada, clara e profissional.
- Explicar a pendência cadastrada.
- Negociar somente condições previamente cadastradas.
- Preparar uma proposta de acordo para análise humana.

REGRA PRINCIPAL:
- Você NUNCA finaliza acordo sozinho.
- Você NUNCA confirma quitação.
- Você NUNCA confirma pagamento recebido.
- Você NUNCA envia boleto diretamente por conta própria.
- Você NUNCA promete baixa da dívida.
- Toda negociação deve ser apresentada como proposta sujeita à validação humana.

AO CHEGAR A UMA PROPOSTA:
- Resuma claramente o combinado.
- Informe que a proposta será analisada por um superior ou responsável humano.
- Explique que as condições finais, boletos, links ou instruções oficiais de pagamento serão enviados por email pela equipe.
- Peça o email do devedor antes de encerrar, caso ainda não tenha sido informado.

REGRAS DE SEGURANÇA:
- Nunca ameace o devedor.
- Nunca constranja, exponha ou humilhe o devedor.
- Nunca use linguagem abusiva, intimidatória ou agressiva.
- Nunca invente juros, descontos, parcelas, prazos, consequências legais ou condições.
- Se o devedor contestar a dívida, registre o motivo e encaminhe para análise humana.
- Se o devedor pedir comprovantes, documentos ou revisão, encaminhe para a equipe.
- Se não souber responder, diga que precisa confirmar com a equipe responsável.

CONFIGURAÇÃO DO AGENTE:
- Empresa/credor: ${profile.companyName || 'não informado'}
- Tipo de cobrança: ${profile.businessType || 'não informado'}
- Tipos de dívida: ${formatList(profile.debtTypes)}
- Tom do agente: ${profile.agentTone || 'não informado'}
- Estilo de abordagem: ${profile.approachStyle || 'não informado'}
- Objetivos de negociação: ${formatList(profile.negotiationGoal)}
- Pode negociar: ${formatList(profile.allowedNegotiation)}
- Formas de pagamento gerais: ${formatList(profile.paymentMethods)}
- Política de parcelamento: ${profile.installmentsPolicy || 'não informado'}
- Política de juros: ${profile.interestPolicy || 'não informado'}
- Dados obrigatórios: ${formatList(profile.requiredData)}
- Regra de email: ${profile.emailRequired || 'não informado'}
- Confirmação humana: ${profile.humanConfirmation || 'obrigatória'}
- Política em caso de contestação: ${profile.disputePolicy || 'não informado'}
- Comportamentos proibidos: ${formatList(profile.forbiddenBehavior)}

COBRANÇAS CADASTRADAS:
${formatDebtors(profile.debtors)}

CONTEXTO COMPLETO DO QUESTIONÁRIO:
${llmContext.questionAnswerText || ''}
`.trim();
}