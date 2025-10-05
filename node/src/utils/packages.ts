// src/utils/packages.ts
export const PACKAGES = {
  29: {
    priceEuros: 29,
    conversations: 200,
    priceId: 'price_1SDuVqHDM5RMdQdJ7u6ouxRj', // ajuste para o real
  },
  59: {
    priceEuros: 59,
    conversations: 500,
    priceId: 'price_1SDuY3HDM5RMdQdJG4cDy7jf',
  },
  99: {
    priceEuros: 99,
    conversations: 1250,
    priceId: 'price_1SDuZHHDM5RMdQdJY5vuIEmp',
  },
} as const;

export type PackageType = keyof typeof PACKAGES;
