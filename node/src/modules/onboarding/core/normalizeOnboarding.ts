//normalizeOnboarding.ts

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

  debtors: any[];
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
      cleanString(answersMap.clinic_subniche) ||
      cleanString(answersMap.collection_business_type),

    services:
      normalizeArray(taxonomy.services).length > 0
        ? normalizeArray(taxonomy.services)
        : normalizeArray(
            answersMap.restaurant_services ||
              answersMap.clinic_services ||
              answersMap.collection_debt_type
          ),

    modules:
      normalizeArray(taxonomy.modules).length > 0
        ? normalizeArray(taxonomy.modules)
        : normalizeArray(
            answersMap.restaurant_modules ||
              answersMap.clinic_modules ||
              answersMap.collection_modules
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

function cleanDebtors(debtors: any[] = []) {
  if (!Array.isArray(debtors)) return [];

  return debtors
    .map((debtor) => ({
      debtorName: cleanString(debtor?.debtorName),
      documentReference: cleanString(debtor?.documentReference),
      debtAmount: cleanString(debtor?.debtAmount),
      dueDate: cleanString(debtor?.dueDate),
      debtOrigin: cleanString(debtor?.debtOrigin),
      paymentMethods: normalizeArray(debtor?.paymentMethods),
      maxInstallments: cleanString(debtor?.maxInstallments),
      interestPolicy: cleanString(debtor?.interestPolicy),
      discountPolicy: cleanString(debtor?.discountPolicy),
      negotiationNotes: cleanString(debtor?.negotiationNotes),
      debtorEmail: cleanString(debtor?.debtorEmail),
    }))
    .filter(
      (debtor) =>
        debtor.debtorName ||
        debtor.documentReference ||
        debtor.debtAmount ||
        debtor.debtOrigin
    );
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

  const products = cleanProducts(plainInput.products || []);
  const debtors = cleanDebtors(plainInput.debtors || []);

  const domainConfig = getOnboardingDomain(domain);

  const domainProfile = domainConfig?.normalize
    ? domainConfig.normalize({
        answers,
        answersMap,
        taxonomy,
        language,
        account,
        products,
        debtors,
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
    products,
    debtors,
  };
}