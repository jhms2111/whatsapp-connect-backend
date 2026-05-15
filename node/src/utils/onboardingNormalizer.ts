type AnyObject = Record<string, any>;

function valueOrEmpty(value: any): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return String(value).trim();
}

function arrayOrEmpty(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [String(value)];
}

export function normalizeOnboardingAnswers(answers: AnyObject = {}) {
  const businessType = answers.businessType || '';

  const normalized = {
    language: answers.language || 'pt',

    businessType,

    assistantPersonality: answers.assistant_personality || '',
    assistantGoal: arrayOrEmpty(answers.assistant_goal),
    responseStyle: answers.response_style || '',
    salesBehavior: answers.sales_behavior || '',
    humanHandoffGlobal: arrayOrEmpty(answers.human_handoff_global),

    businessName:
      answers.restaurant_name ||
      answers.business_name ||
      answers.company_name ||
      '',

    businessDescription:
      answers.restaurant_description ||
      answers.business_description ||
      '',

    openingHours:
      answers.restaurant_opening_hours ||
      answers.business_hours ||
      '',

    paymentMethods:
      answers.restaurant_payment_methods ||
      answers.payment_methods ||
      [],

    faq:
      answers.restaurant_faq ||
      answers.common_questions ||
      '',

    tone:
      answers.restaurant_tone ||
      answers.assistant_personality ||
      '',

    humanHandoff:
      answers.restaurant_human_handoff ||
      answers.human_handoff_global ||
      [],

    location:
      answers.restaurant_location || '',

    website:
      answers.restaurant_website || '',

    instagram:
      answers.restaurant_instagram || '',

    whatsapp:
      answers.restaurant_whatsapp || '',

    finalNotes:
      answers.restaurant_final_notes || '',

    restaurant: {
      name: valueOrEmpty(answers.restaurant_name),
      type: valueOrEmpty(answers.restaurant_type),
      description: valueOrEmpty(answers.restaurant_description),
      location: valueOrEmpty(answers.restaurant_location),
      openingHours: valueOrEmpty(answers.restaurant_opening_hours),
      serviceModes: arrayOrEmpty(answers.restaurant_service_modes),
      deliveryArea: valueOrEmpty(answers.restaurant_delivery_area),
      deliveryTime: valueOrEmpty(answers.restaurant_delivery_time),
      reservation: valueOrEmpty(answers.restaurant_reservation),
      averageTicket: valueOrEmpty(answers.restaurant_average_ticket),
      mainDishes: valueOrEmpty(answers.restaurant_main_dishes),
      bestSeller: valueOrEmpty(answers.restaurant_best_seller),
      recommendationStyle: valueOrEmpty(answers.restaurant_recommendation_style),
      menuCategories: arrayOrEmpty(answers.restaurant_menu_categories),
      specialOptions: arrayOrEmpty(answers.restaurant_special_options),
      allergies: valueOrEmpty(answers.restaurant_allergies),
      ingredientsPolicy: valueOrEmpty(answers.restaurant_ingredients_policy),
      spicyOptions: valueOrEmpty(answers.restaurant_spicy_options),
      kidsOptions: valueOrEmpty(answers.restaurant_kids_options),
      drinks: valueOrEmpty(answers.restaurant_drinks),
      alcohol: valueOrEmpty(answers.restaurant_alcohol),
      desserts: valueOrEmpty(answers.restaurant_desserts),
      combos: valueOrEmpty(answers.restaurant_combos),
      promotions: valueOrEmpty(answers.restaurant_promotions),
      paymentMethods: arrayOrEmpty(answers.restaurant_payment_methods),
      parking: valueOrEmpty(answers.restaurant_parking),
      petFriendly: valueOrEmpty(answers.restaurant_pet_friendly),
      accessibility: valueOrEmpty(answers.restaurant_accessibility),
      wifi: valueOrEmpty(answers.restaurant_wifi),
      environment: valueOrEmpty(answers.restaurant_music_environment),
      events: valueOrEmpty(answers.restaurant_events),
      privateEvents: valueOrEmpty(answers.restaurant_private_events),
      largeGroups: valueOrEmpty(answers.restaurant_large_groups),
      cancellationPolicy: valueOrEmpty(answers.restaurant_cancellation_policy),
      orderPolicy: valueOrEmpty(answers.restaurant_order_policy),
      deliveryPlatforms: arrayOrEmpty(answers.restaurant_delivery_platforms),
      customerData: arrayOrEmpty(answers.restaurant_customer_data),
      humanHandoff: arrayOrEmpty(answers.restaurant_human_handoff),
      complaints: valueOrEmpty(answers.restaurant_complaints),
      tone: valueOrEmpty(answers.restaurant_tone),
      upsell: arrayOrEmpty(answers.restaurant_upsell),
      faq: valueOrEmpty(answers.restaurant_faq),
      forbiddenAnswers: valueOrEmpty(answers.restaurant_forbidden_answers),
      socialLinks: valueOrEmpty(answers.restaurant_social_links),
      website: valueOrEmpty(answers.restaurant_website),
      instagram: valueOrEmpty(answers.restaurant_instagram),
      whatsapp: valueOrEmpty(answers.restaurant_whatsapp),
      finalNotes: valueOrEmpty(answers.restaurant_final_notes),
    },
  };

  return normalized;
}

export function getCollectionTitle(businessType?: string) {
  const map: Record<string, string> = {
    restaurant: 'Cardápio',
    real_estate: 'Imóveis',
    aesthetic_clinic: 'Tratamentos',
    beauty_salon: 'Serviços de beleza',
    language_school: 'Cursos',
    law_firm: 'Serviços jurídicos',
    sales: 'Ofertas',
    services: 'Serviços',
    online_store: 'Produtos',
    health_clinic: 'Serviços de saúde',
    other: 'Ofertas',
  };

  return map[businessType || ''] || 'Ofertas';
}

export function buildProductDescription(product: any) {
  const description = product?.description?.trim() || '';
  const link = product?.link?.trim();

  if (link) {
    return `${description}\n\nLink: ${link}`;
  }

  return description;
}

export function buildAbout({
  normalized,
  products,
}: {
  normalized: any;
  products: any[];
}) {
  const r = normalized.restaurant || {};

  const productText =
    products.length > 0
      ? products
          .map((p) => {
            const price = p.price ? ` | Preço: ${p.price}` : '';
            const link = p.link ? ` | Link: ${p.link}` : '';
            return `- ${p.title}: ${p.description || ''}${price}${link}`;
          })
          .join('\n')
      : 'Nenhum produto ou serviço informado.';

  return `
Tipo de negócio: ${normalized.businessType || ''}

Nome do negócio:
${normalized.businessName || ''}

Descrição do negócio:
${normalized.businessDescription || ''}

Localização / endereço:
${normalized.location || ''}

Horários de atendimento:
${normalized.openingHours || ''}

Formas de pagamento:
${Array.isArray(normalized.paymentMethods) ? normalized.paymentMethods.join(', ') : normalized.paymentMethods || ''}

Produtos ou serviços principais:
${productText}

Informações específicas do restaurante:
- Tipo: ${r.type || ''}
- Modos de atendimento: ${r.serviceModes?.join(', ') || ''}
- Área de entrega: ${r.deliveryArea || ''}
- Tempo médio de entrega/preparo: ${r.deliveryTime || ''}
- Reservas: ${r.reservation || ''}
- Faixa média de preço: ${r.averageTicket || ''}
- Pratos principais: ${r.mainDishes || ''}
- Mais recomendados: ${r.bestSeller || ''}
- Estilo de recomendação: ${r.recommendationStyle || ''}
- Categorias do cardápio: ${r.menuCategories?.join(', ') || ''}
- Opções especiais: ${r.specialOptions?.join(', ') || ''}
- Alergias: ${r.allergies || ''}
- Política de ingredientes: ${r.ingredientsPolicy || ''}
- Opções picantes: ${r.spicyOptions || ''}
- Menu infantil: ${r.kidsOptions || ''}
- Bebidas: ${r.drinks || ''}
- Álcool: ${r.alcohol || ''}
- Sobremesas: ${r.desserts || ''}
- Combos: ${r.combos || ''}
- Promoções: ${r.promotions || ''}
- Estacionamento: ${r.parking || ''}
- Pet friendly: ${r.petFriendly || ''}
- Acessibilidade: ${r.accessibility || ''}
- Wi-Fi: ${r.wifi || ''}
- Ambiente: ${r.environment || ''}
- Eventos: ${r.events || ''}
- Eventos privados: ${r.privateEvents || ''}
- Grupos grandes: ${r.largeGroups || ''}
- Política de cancelamento: ${r.cancellationPolicy || ''}
- Como fazer pedidos: ${r.orderPolicy || ''}
- Plataformas de delivery: ${r.deliveryPlatforms?.join(', ') || ''}
- Dados que o assistente deve pedir: ${r.customerData?.join(', ') || ''}
- Como lidar com reclamações: ${r.complaints || ''}
- Upsell: ${r.upsell?.join(', ') || ''}
- Perguntas frequentes: ${r.faq || ''}
- O que nunca responder/prometer: ${r.forbiddenAnswers || ''}
- Links importantes: ${r.socialLinks || ''}
- Website: ${r.website || ''}
- Instagram: ${r.instagram || ''}
- WhatsApp: ${r.whatsapp || ''}
- Notas finais: ${r.finalNotes || ''}
`.trim();
}

export function buildGuidelines(normalized: any) {
  const languageInstruction: Record<string, string> = {
    pt: 'Responda sempre em português, a menos que o cliente peça outro idioma.',
    es: 'Responde siempre en español, a menos que el cliente pida otro idioma.',
    en: 'Always reply in English unless the customer asks for another language.',
  };

  const lang = normalized.language || 'pt';
  const r = normalized.restaurant || {};

  return `
Você é o assistente virtual oficial deste negócio.

IDIOMA:
- ${languageInstruction[lang] || languageInstruction.pt}

PERSONALIDADE:
- ${normalized.assistantPersonality || normalized.tone || 'profissional e simpático'}

OBJETIVO:
- ${
    Array.isArray(normalized.assistantGoal) && normalized.assistantGoal.length
      ? normalized.assistantGoal.join(', ')
      : 'Ajudar clientes com informações do negócio.'
  }

ESTILO DE RESPOSTA:
- ${normalized.responseStyle || 'Respostas claras, úteis e objetivas.'}

COMPORTAMENTO COMERCIAL:
- ${normalized.salesBehavior || 'Ajudar sem pressionar o cliente.'}

REGRAS GERAIS:
- Seja educado, claro e humano.
- Responda em mensagens curtas.
- Nunca invente preços, horários, promoções, prazos ou políticas.
- Use apenas as informações cadastradas sobre a empresa.
- Se não souber responder, diga que precisa confirmar com a equipe.
- Se o cliente pedir atendimento humano, encaminhe educadamente.
- Conduza a conversa com perguntas simples.

REGRAS ESPECÍFICAS:
- Não prometa mesa, reserva, entrega, desconto ou disponibilidade sem confirmação.
- Informe alergias e restrições apenas com base nos dados cadastrados.
- Se houver reclamação, siga esta orientação: ${r.complaints || 'pedir desculpas, coletar dados e encaminhar para a equipe.'}
- O assistente nunca deve prometer ou responder: ${r.forbiddenAnswers || 'informações que não estejam cadastradas.'}

QUANDO CHAMAR UM HUMANO:
- ${
    Array.isArray(normalized.humanHandoff) && normalized.humanHandoff.length
      ? normalized.humanHandoff.join(', ')
      : Array.isArray(normalized.humanHandoffGlobal) && normalized.humanHandoffGlobal.length
        ? normalized.humanHandoffGlobal.join(', ')
        : 'Quando não souber responder ou quando o cliente pedir.'
  }

FINALIZAÇÃO:
- Sempre que fizer sentido, termine com uma pergunta simples para avançar a conversa.
`.trim();
}