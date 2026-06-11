//registry.ts



import restaurantDomain from '../domains/restaurant/restaurant.index';
import debtCollectionDomain from '../domains/debt_collection/debtCollection.index';

export const onboardingDomains: Record<string, any> = {
  restaurant: restaurantDomain,
  debt_collection: debtCollectionDomain,
};

export function getOnboardingDomain(domain?: string) {
  if (!domain) return null;

  return onboardingDomains[domain] || null;
}