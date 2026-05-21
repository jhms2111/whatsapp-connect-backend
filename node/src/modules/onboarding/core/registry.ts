//registry.ts



import restaurantDomain from '../domains/restaurant/restaurant.index';


export const onboardingDomains: Record<string, any> = {
  restaurant: restaurantDomain,
  
};

export function getOnboardingDomain(domain?: string) {
  if (!domain) return null;

  return onboardingDomains[domain] || null;
}