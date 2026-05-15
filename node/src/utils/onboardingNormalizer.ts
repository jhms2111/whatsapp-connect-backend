type AnyObject = Record<string, any>;

type Lang = 'pt' | 'es' | 'en';

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

function getLang(answers: AnyObject): Lang {
  if (answers.language === 'es') return 'es';
  if (answers.language === 'en') return 'en';
  return 'pt';
}

const questionLabels: Record<string, Record<Lang, string>> = {
  language: {
    pt: 'Em qual idioma o assistente deve falar?',
    es: '¿En qué idioma debe hablar el asistente?',
    en: 'Which language should the assistant speak?',
  },
  assistant_personality: {
    pt: 'Qual personalidade o assistente deve ter?',
    es: '¿Qué personalidad debe tener el asistente?',
    en: 'What personality should the assistant have?',
  },
  assistant_goal: {
    pt: 'Qual é o objetivo principal do assistente?',
    es: '¿Cuál es el objetivo principal del asistente?',
    en: 'What is the assistant’s main goal?',
  },
  response_style: {
    pt: 'Como devem ser as respostas?',
    es: '¿Cómo deben ser las respuestas?',
    en: 'How should the answers be?',
  },
  sales_behavior: {
    pt: 'O assistente deve tentar vender?',
    es: '¿El asistente debe intentar vender?',
    en: 'Should the assistant try to sell?',
  },
  human_handoff_global: {
    pt: 'Quando o assistente deve chamar um humano?',
    es: '¿Cuándo debe llamar a un humano?',
    en: 'When should the assistant call a human?',
  },
  businessType: {
    pt: 'Qual é o tipo do negócio?',
    es: '¿Cuál es el tipo del negocio?',
    en: 'What type of business is it?',
  },

  restaurant_name: {
    pt: 'Qual é o nome do restaurante?',
    es: '¿Cuál es el nombre del restaurante?',
    en: 'What is the restaurant name?',
  },
  restaurant_type: {
    pt: 'Qual é o estilo principal do restaurante?',
    es: '¿Cuál es el estilo principal del restaurante?',
    en: 'What is the restaurant’s main style?',
  },
  restaurant_description: {
    pt: 'Como você descreveria o restaurante?',
    es: '¿Cómo describirías el restaurante?',
    en: 'How would you describe the restaurant?',
  },
  restaurant_location: {
    pt: 'Qual é o endereço ou região de atendimento?',
    es: '¿Cuál es la dirección o zona de atención?',
    en: 'What is the address or service area?',
  },
  restaurant_opening_hours: {
    pt: 'Quais são os horários de funcionamento?',
    es: '¿Cuáles son los horarios de apertura?',
    en: 'What are the opening hours?',
  },
  restaurant_service_modes: {
    pt: 'Quais formas de atendimento o restaurante oferece?',
    es: '¿Qué formas de atención ofrece el restaurante?',
    en: 'Which service modes does the restaurant offer?',
  },
  restaurant_delivery_area: {
    pt: 'Qual é a área de entrega?',
    es: '¿Cuál es la zona de entrega?',
    en: 'What is the delivery area?',
  },
  restaurant_delivery_time: {
    pt: 'Qual é o tempo médio de entrega ou preparo?',
    es: '¿Cuál es el tiempo medio de entrega o preparación?',
    en: 'What is the average delivery or preparation time?',
  },
  restaurant_reservation: {
    pt: 'O assistente pode ajudar com reservas?',
    es: '¿El asistente puede ayudar con reservas?',
    en: 'Can the assistant help with reservations?',
  },
  restaurant_average_ticket: {
    pt: 'Qual é a faixa média de preço por pessoa?',
    es: '¿Cuál es el precio medio por persona?',
    en: 'What is the average price range per person?',
  },
  restaurant_main_dishes: {
    pt: 'Quais são os principais pratos do restaurante?',
    es: '¿Cuáles son los platos principales del restaurante?',
    en: 'What are the restaurant’s main dishes?',
  },
  restaurant_best_seller: {
    pt: 'Quais pratos o assistente deve recomendar primeiro?',
    es: '¿Qué platos debe recomendar primero el asistente?',
    en: 'Which dishes should the assistant recommend first?',
  },
  restaurant_recommendation_style: {
    pt: 'Como o assistente deve fazer recomendações?',
    es: '¿Cómo debe hacer recomendaciones el asistente?',
    en: 'How should the assistant make recommendations?',
  },
  restaurant_menu_categories: {
    pt: 'Quais categorias existem no cardápio?',
    es: '¿Qué categorías existen en el menú?',
    en: 'Which menu categories exist?',
  },
  restaurant_special_options: {
    pt: 'O restaurante oferece opções especiais?',
    es: '¿El restaurante ofrece opciones especiales?',
    en: 'Does the restaurant offer special options?',
  },
  restaurant_allergies: {
    pt: 'Existem alertas importantes sobre alergias?',
    es: '¿Hay alertas importantes sobre alergias?',
    en: 'Are there important allergy warnings?',
  },
  restaurant_ingredients_policy: {
    pt: 'O cliente pode pedir alterações nos ingredientes?',
    es: '¿El cliente puede pedir cambios en los ingredientes?',
    en: 'Can customers request ingredient changes?',
  },
  restaurant_spicy_options: {
    pt: 'Existem opções picantes?',
    es: '¿Hay opciones picantes?',
    en: 'Are there spicy options?',
  },
  restaurant_kids_options: {
    pt: 'Existe menu infantil?',
    es: '¿Existe menú infantil?',
    en: 'Is there a kids menu?',
  },
  restaurant_drinks: {
    pt: 'Quais bebidas o restaurante oferece?',
    es: '¿Qué bebidas ofrece el restaurante?',
    en: 'What drinks does the restaurant offer?',
  },
  restaurant_alcohol: {
    pt: 'O restaurante serve bebidas alcoólicas?',
    es: '¿El restaurante sirve bebidas alcohólicas?',
    en: 'Does the restaurant serve alcoholic drinks?',
  },
  restaurant_desserts: {
    pt: 'Quais sobremesas devem ser recomendadas?',
    es: '¿Qué postres se deben recomendar?',
    en: 'Which desserts should be recommended?',
  },
  restaurant_combos: {
    pt: 'Existem combos ou menus especiais?',
    es: '¿Hay combos o menús especiales?',
    en: 'Are there combos or special menus?',
  },
  restaurant_promotions: {
    pt: 'Existem promoções fixas ou dias especiais?',
    es: '¿Hay promociones fijas o días especiales?',
    en: 'Are there fixed promotions or special days?',
  },
  restaurant_payment_methods: {
    pt: 'Quais formas de pagamento são aceitas?',
    es: '¿Qué métodos de pago se aceptan?',
    en: 'Which payment methods are accepted?',
  },
  restaurant_parking: {
    pt: 'O restaurante tem estacionamento?',
    es: '¿El restaurante tiene aparcamiento?',
    en: 'Does the restaurant have parking?',
  },
  restaurant_pet_friendly: {
    pt: 'O restaurante aceita pets?',
    es: '¿El restaurante acepta mascotas?',
    en: 'Is the restaurant pet-friendly?',
  },
  restaurant_accessibility: {
    pt: 'Existe acessibilidade no local?',
    es: '¿Hay accesibilidad en el local?',
    en: 'Is the venue accessible?',
  },
  restaurant_wifi: {
    pt: 'O restaurante oferece Wi-Fi para clientes?',
    es: '¿El restaurante ofrece Wi-Fi para clientes?',
    en: 'Does the restaurant offer Wi-Fi for customers?',
  },
  restaurant_music_environment: {
    pt: 'Como é o ambiente do restaurante?',
    es: '¿Cómo es el ambiente del restaurante?',
    en: 'What is the restaurant atmosphere like?',
  },
  restaurant_events: {
    pt: 'O restaurante realiza eventos?',
    es: '¿El restaurante realiza eventos?',
    en: 'Does the restaurant host events?',
  },
  restaurant_private_events: {
    pt: 'O restaurante aceita eventos privados?',
    es: '¿El restaurante acepta eventos privados?',
    en: 'Does the restaurant accept private events?',
  },
  restaurant_large_groups: {
    pt: 'Qual o limite ou condição para grupos grandes?',
    es: '¿Cuál es el límite o condición para grupos grandes?',
    en: 'What is the limit or condition for large groups?',
  },
  restaurant_cancellation_policy: {
    pt: 'Existe política de cancelamento de reservas?',
    es: '¿Existe política de cancelación de reservas?',
    en: 'Is there a reservation cancellation policy?',
  },
  restaurant_order_policy: {
    pt: 'Como o cliente deve fazer pedidos?',
    es: '¿Cómo debe hacer pedidos el cliente?',
    en: 'How should customers place orders?',
  },
  restaurant_delivery_platforms: {
    pt: 'O restaurante usa plataformas de delivery?',
    es: '¿El restaurante usa plataformas de delivery?',
    en: 'Does the restaurant use delivery platforms?',
  },
  restaurant_customer_data: {
    pt: 'Quais dados o assistente deve pedir do cliente?',
    es: '¿Qué datos debe pedir el asistente al cliente?',
    en: 'What customer data should the assistant ask for?',
  },
  restaurant_human_handoff: {
    pt: 'Quando o assistente deve chamar um humano?',
    es: '¿Cuándo debe llamar a un humano?',
    en: 'When should the assistant call a human?',
  },
  restaurant_complaints: {
    pt: 'Como o assistente deve lidar com reclamações?',
    es: '¿Cómo debe manejar reclamaciones el asistente?',
    en: 'How should the assistant handle complaints?',
  },
  restaurant_tone: {
    pt: 'Qual deve ser o tom do assistente?',
    es: '¿Cuál debe ser el tono del asistente?',
    en: 'What should the assistant’s tone be?',
  },
  restaurant_upsell: {
    pt: 'O assistente deve incentivar quais vendas extras?',
    es: '¿Qué ventas extra debe incentivar el asistente?',
    en: 'Which extras should the assistant encourage?',
  },
  restaurant_faq: {
    pt: 'Quais perguntas os clientes fazem com frequência?',
    es: '¿Qué preguntas hacen los clientes con frecuencia?',
    en: 'What questions do customers often ask?',
  },
  restaurant_forbidden_answers: {
    pt: 'O que o assistente nunca deve prometer ou responder?',
    es: '¿Qué nunca debe prometer o responder el asistente?',
    en: 'What should the assistant never promise or answer?',
  },
  restaurant_social_links: {
    pt: 'Quais links importantes o assistente pode enviar?',
    es: '¿Qué links importantes puede enviar el asistente?',
    en: 'Which important links can the assistant send?',
  },
  restaurant_website: {
    pt: 'Qual é o site do restaurante?',
    es: '¿Cuál es la web del restaurante?',
    en: 'What is the restaurant website?',
  },
  restaurant_instagram: {
    pt: 'Qual é o Instagram do restaurante?',
    es: '¿Cuál es el Instagram del restaurante?',
    en: 'What is the restaurant Instagram?',
  },
  restaurant_whatsapp: {
    pt: 'Qual WhatsApp ou telefone o cliente pode usar?',
    es: '¿Qué WhatsApp o teléfono puede usar el cliente?',
    en: 'Which WhatsApp or phone can customers use?',
  },
  restaurant_final_notes: {
    pt: 'Existe mais alguma orientação importante para o assistente?',
    es: '¿Hay alguna otra orientación importante para el asistente?',
    en: 'Is there any other important instruction for the assistant?',
  },
};

function humanizeKey(key: string) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAnswer(value: any): string {
  if (value === undefined || value === null || value === '') return '';

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value).trim();
}

function buildQuestionAnswerContext(answers: AnyObject = {}) {
  const lang = getLang(answers);

  return Object.entries(answers)
    .map(([key, value]) => {
      const answer = formatAnswer(value);
      if (!answer) return '';

      const question =
        questionLabels[key]?.[lang] ||
        questionLabels[key]?.pt ||
        humanizeKey(key);

      if (lang === 'es') {
        return `Pregunta: ${question}\nRespuesta: ${answer}`;
      }

      if (lang === 'en') {
        return `Question: ${question}\nAnswer: ${answer}`;
      }

      return `Pergunta: ${question}\nResposta: ${answer}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function normalizeOnboardingAnswers(answers: AnyObject = {}) {
  const businessType = answers.businessType || '';
  const questionAnswerContext = buildQuestionAnswerContext(answers);

  const normalized = {
    language: answers.language || 'pt',

    businessType,

    questionAnswerContext,

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
CONTEXTO COMPLETO DO QUESTIONÁRIO:
${normalized.questionAnswerContext || 'Nenhuma resposta cadastrada.'}

PRODUTOS OU SERVIÇOS CADASTRADOS:
${productText}
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
- Use o CONTEXTO COMPLETO DO QUESTIONÁRIO como fonte principal.
- Considere sempre a pergunta e a resposta juntas.
- Responda de acordo com o idioma configurado no questionário, exceto se o cliente escrever em outro idioma.
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