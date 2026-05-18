import { getLang } from '../utils/language';
import { cleanAnswers } from '../utils/answer';
import { cleanString } from '../utils/value';
import { getOnboardingDomain } from './registry';

export type NormalizedOnboarding = {
  language: 'pt' | 'es' | 'en';

  domain: string;

  taxonomy: {
    mainCategory: string;
    subniche: string;
    services: string[];
    modules: string[];
  };

  answers: any[];

  answersMap: Record<string, any>;

  domainProfile: Record<string, any>;

  account: {
    businessName: string;
    email: string;
    phone: string;
  };

  products: any[];
};

function normalizeArray(value: any): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }

  return [String(value)];
}

function normalizeTaxonomy(taxonomy: any = {}, answersMap: any = {}) {
  return {
    mainCategory:
      cleanString(taxonomy.mainCategory) ||
      cleanString(answersMap.main_category),

    subniche:
      cleanString(taxonomy.subniche) ||
      cleanString(answersMap.restaurant_subniche) ||
      cleanString(answersMap.clinic_subniche),

    services:
      normalizeArray(taxonomy.services).length > 0
        ? normalizeArray(taxonomy.services)
        : normalizeArray(
            answersMap.restaurant_services ||
              answersMap.clinic_services
          ),

    modules:
      normalizeArray(taxonomy.modules).length > 0
        ? normalizeArray(taxonomy.modules)
        : normalizeArray(
            answersMap.restaurant_modules ||
              answersMap.clinic_modules
          ),
  };
}

function cleanProducts(products: any[] = []) {
  if (!Array.isArray(products)) return [];

  return products
    .map((product) => ({
      title: cleanString(product?.title),
      description: cleanString(product?.description),
      price: product?.price ?? '',
      link: cleanString(product?.link),
    }))
    .filter((product) => product.title || product.description);
}

export function normalizeOnboarding(input: any): NormalizedOnboarding {
  const plainInput =
    typeof input?.toObject === 'function'
      ? input.toObject()
      : input || {};

  const answersMap = plainInput.answersMap || {};
  const answers = cleanAnswers(plainInput.answers || []);

  const language = getLang(
    plainInput.language || answersMap.language
  );

  const taxonomy = normalizeTaxonomy(
    plainInput.taxonomy,
    answersMap
  );

  const domain =
    cleanString(plainInput.domain) ||
    cleanString(taxonomy.mainCategory) ||
    cleanString(answersMap.main_category);

  const account = {
    businessName: cleanString(
      plainInput.account?.businessName
    ),
    email: cleanString(plainInput.account?.email),
    phone: cleanString(plainInput.account?.phone),
  };

  const domainConfig = getOnboardingDomain(domain);

  const domainProfile = domainConfig?.normalize
    ? domainConfig.normalize({
        answers,
        answersMap,
        taxonomy,
        language,
        account,
        products: plainInput.products || [],
      })
    : {};

  return {
    language,
    domain,

    taxonomy: {
      ...taxonomy,
      mainCategory: taxonomy.mainCategory || domain,
    },

    answers,
    answersMap,
    domainProfile,
    account,
    products: cleanProducts(plainInput.products || []),
  };
}