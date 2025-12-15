// src/utils/packages.ts

export type Channel = 'whatsapp' | 'webchat';

export type BasePkg = {
  priceEuros: number;
  conversations: number;
  priceId: string;                    // ID do preço no Stripe
  mode?: 'payment' | 'subscription';  // opcional: se o preço é recorrente
};

export const PACKAGES = {
  whatsapp: {
    589: {
      priceEuros: 589,
      conversations: 1250,
      priceId: 'price_1SeWoeHTEWXeEltkYBJNd484',
      mode: 'subscription',
    },
    349: {
      priceEuros: 349,
      conversations: 500,
      priceId: 'price_1SeWpIHTEWXeEltktFbqDr6S',
      mode: 'subscription',
    },
    99: {
      priceEuros: 0.50,
      conversations: 1250,
      priceId: 'price_1SYe4THTEWXeEltkiANpOD6h',
      mode: 'subscription',
    },
  } as const,

  webchat: {
    // Plano 49 — ainda usando price antigo
    49: {
      priceEuros: 49,
      conversations: 200,
      priceId: 'price_1SeWiZHTEWXeEltkVYFVqYkU',
      mode: 'subscription',
    },

    // Plano 99 — TESTE com price de €0,55
    99: {
      priceEuros: 99,
      conversations: 600,
      priceId: 'price_1SeWlqHTEWXeEltkbZRadfKY', // 👈 seu priceId de 0,55
      mode: 'subscription',
    },

    // Plano 139 — ainda usando price antigo
    139: {
      priceEuros: 139,
      conversations: 1000,
      priceId: 'price_1SeWmVHTEWXeEltkZP7ZY9So',
      mode: 'subscription',
    },
  } as const,
} as const;

export type WhatsappPackageType = keyof typeof PACKAGES.whatsapp; // 29|59|99
export type WebchatPackageType = keyof typeof PACKAGES.webchat;   // 9|39|79

export function getPackage(channel: Channel, pkg: number): BasePkg | null {
  const group = PACKAGES[channel] as Record<number, BasePkg> | undefined;
  if (!group) return null;
  return group[pkg] || null;
}
