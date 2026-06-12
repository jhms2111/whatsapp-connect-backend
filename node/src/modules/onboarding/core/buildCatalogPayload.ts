import { getOnboardingDomain } from './registry';

export function getCollectionTitle(domain?: string) {
  const domainConfig = getOnboardingDomain(domain);

  if (domainConfig?.getCollectionTitle) {
    return domainConfig.getCollectionTitle();
  }

  const map: Record<string, string> = {
    restaurant: 'Cardápio',
    clinic: 'Serviços',
    real_estate: 'Imóveis',
    beauty_salon: 'Serviços de beleza',
    language_school: 'Cursos',
    law_firm: 'Serviços jurídicos',
    online_store: 'Produtos',
    services: 'Serviços',
    debt_collection: 'Cobranças',
  };

  return map[domain || ''] || 'Ofertas';
}

function toNumberOrNull(value: any) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const normalized = String(value)
    .replace(/[^\d.,-]/g, '')
    .replace(',', '.');

  const numberValue = Number(normalized);

  return Number.isFinite(numberValue) ? numberValue : null;
}

export function buildCatalogItemPayload(product: any) {
  const description = product?.link
    ? `${product.description || ''}\n\nLink: ${product.link}`
    : product?.description || '';

  return {
    values: {
      title: product?.title || 'Item',
      description,
      price_eur: toNumberOrNull(product?.price),
    },
    images: [],
  };
}

export function buildDebtCatalogItemPayload(debtor: any) {
  const parts = [
    debtor?.documentReference
      ? `Referência/documento: ${debtor.documentReference}`
      : '',

    debtor?.debtAmount
      ? `Valor da dívida: ${debtor.debtAmount}`
      : '',

    debtor?.dueDate
      ? `Vencimento: ${debtor.dueDate}`
      : '',

    debtor?.debtOrigin
      ? `Origem da dívida: ${debtor.debtOrigin}`
      : '',

    Array.isArray(debtor?.paymentMethods) && debtor.paymentMethods.length
      ? `Formas de pagamento: ${debtor.paymentMethods.join(', ')}`
      : '',

    debtor?.maxInstallments
      ? `Máximo de parcelas: ${debtor.maxInstallments}`
      : '',

    debtor?.interestPolicy
      ? `Juros/encargos: ${debtor.interestPolicy}`
      : '',

    debtor?.discountPolicy
      ? `Desconto permitido: ${debtor.discountPolicy}`
      : '',

    debtor?.debtorEmail
      ? `Email do devedor: ${debtor.debtorEmail}`
      : '',

    debtor?.negotiationNotes
      ? `Observações: ${debtor.negotiationNotes}`
      : '',
  ].filter(Boolean);

  return {
    values: {
      title:
        debtor?.debtorName ||
        debtor?.documentReference ||
        'Cobrança',

      description:
        parts.join('\n') ||
        'Cobrança cadastrada durante a criação do agente.',

      price_eur: toNumberOrNull(debtor?.debtAmount),
    },
    images: [],
  };
}

export function buildFallbackCatalogItem(normalized: any) {
  return {
    values: {
      title:
        normalized.account?.businessName ||
        normalized.domainProfile?.name ||
        normalized.domainProfile?.companyName ||
        'Informações do negócio',

      description:
        normalized.domainProfile?.description ||
        normalized.llmContext?.summary ||
        'Informações gerais cadastradas durante a criação do assistente.',

      price_eur: null,
    },
    images: [],
  };
}