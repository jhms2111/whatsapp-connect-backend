// src/utils/packages.ts

export type Channel = 'whatsapp' | 'webchat';

type BasePkg = {
  priceEuros: number;
  conversations: number;
  priceId: string;              // ID do preço no Stripe
  mode?: 'payment' | 'subscription'; // opcional: se o preço é recorrente
};

export const PACKAGES = {
  whatsapp: {
    29: { priceEuros: 0.50, conversations: 200, priceId: 'price_1SYe4THTEWXeEltkiANpOD6h', mode: 'subscription' },
    59: { priceEuros: 0.50, conversations: 500, priceId: 'price_1SYe4THTEWXeEltkiANpOD6h', mode: 'subscription' },
    99: { priceEuros: 0.50, conversations: 1250, priceId: 'price_1SYe4THTEWXeEltkiANpOD6h', mode: 'subscription' },
  } as const,

  webchat: {
     9: { priceEuros: 0.50, conversations: 100, priceId: 'price_1SYe4THTEWXeEltkiANpOD6h', mode: 'subscription' },
    39: { priceEuros: 0.50, conversations: 300, priceId: 'price_1SYe4THTEWXeEltkiANpOD6h', mode: 'subscription' },
    79: { priceEuros: 0.50, conversations: 900, priceId: 'price_1SYe4THTEWXeEltkiANpOD6h', mode: 'subscription' },
  } as const,
} as const;

export type WhatsappPackageType = keyof typeof PACKAGES.whatsapp; // 29|59|99
export type WebchatPackageType = keyof typeof PACKAGES.webchat;   // 19|39|79

export function getPackage(channel: Channel, pkg: number): BasePkg | null {
  const group = PACKAGES[channel] as Record<number, BasePkg> | undefined;
  if (!group) return null;
  return group[pkg] || null;
}


