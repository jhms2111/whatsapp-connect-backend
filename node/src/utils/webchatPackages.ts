//webchatPackages.ts

export const WEBCHAT_PACKAGES = {
  49: {
    priceEuros: 49,
    conversations: 200,
    priceId: 'price_1SeWiZHTEWXeEltkVYFVqYkU', // substitua pelos seus IDs reais do Stripe
  },
  99: {
    priceEuros: 99,
    conversations: 600,
    priceId: 'price_1SeWlqHTEWXeEltkbZRadfKY',
  },
  139: {
    priceEuros: 139,
    conversations: 1000,
    priceId: 'price_1SeWmVHTEWXeEltkZP7ZY9So',
  },
} as const;

export type WebchatPackageType = keyof typeof WEBCHAT_PACKAGES;
