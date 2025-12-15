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
    29: {
      priceEuros: 0.50,
      conversations: 200,
      priceId: 'price_1SYe4THTEWXeEltkiANpOD6h',
      mode: 'subscription',
    },
    59: {
      priceEuros: 0.55,
      conversations: 500,
      priceId: 'price_1SZlPlHTEWXeEltk17NAmKGs',
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
    // Plano 9 — ainda usando price antigo
    9: {
      priceEuros: 0.50,
      conversations: 100,
      priceId: 'price_1SYe4THTEWXeEltkiANpOD6h',
      mode: 'subscription',
    },

    // Plano 39 — TESTE com price de €0,55
    39: {
      priceEuros: 0.55,
      conversations: 300,
      priceId: 'price_1SZlPlHTEWXeEltk17NAmKGs', // 👈 seu priceId de 0,55
      mode: 'subscription',
    },

    // Plano 79 — ainda usando price antigo
    79: {
      priceEuros: 0.50,
      conversations: 900,
      priceId: 'price_1SYe4THTEWXeEltkiANpOD6h',
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
