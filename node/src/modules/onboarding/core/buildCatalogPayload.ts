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
  };

  return map[domain || ''] || 'Ofertas';
}

export function buildCatalogItemPayload(product: any) {
  const description = product?.link
    ? `${product.description || ''}\n\nLink: ${product.link}`
    : product?.description || '';

  const priceNumber =
    product?.price !== '' &&
    product?.price !== null &&
    product?.price !== undefined
      ? Number(product.price)
      : null;

  return {
    values: {
      title: product?.title || 'Item',
      description,
      price_eur: Number.isFinite(priceNumber) ? priceNumber : null,
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