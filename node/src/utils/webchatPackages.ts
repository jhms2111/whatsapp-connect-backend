//webchatPackages.ts

export const WEBCHAT_PACKAGES = {
  19: {
    priceEuros: 19,
    conversations: 100,
    priceId: 'price_1SMkWqHDM5RMdQdJPSrOlBYu', // substitua pelos seus IDs reais do Stripe
  },
  39: {
    priceEuros: 39,
    conversations: 300,
    priceId: 'price_1SDuY3HDM5RMdQdJG4cDy7jf',
  },
  79: {
    priceEuros: 79,
    conversations: 900,
    priceId: 'price_1SDuZHHDM5RMdQdJY5vuIEmp',
  },
} as const;

export type WebchatPackageType = keyof typeof WEBCHAT_PACKAGES;
