//domainProfileRegistry.ts


import { createRestaurantProfile } from '../../../infraestructure/mongo/models/onboarding/restaurant/restaurantProfile.service';
import { createDebtCollectionProfile } from '../../../infraestructure/mongo/models/onboarding/debtCollection/debtCollectionProfile.service';

const domainProfileCreators: Record<string, any> = {
  restaurant: createRestaurantProfile,
  debt_collection: createDebtCollectionProfile,
};

export async function createDomainProfile({
  domain,
  owner,
  botId,
  normalized,
}: {
  domain: string;
  owner: string;
  botId: any;
  normalized: any;
}) {
  const creator = domainProfileCreators[domain];

  if (!creator) {
    return null;
  }

  return creator({
    owner,
    botId,
    normalized,
  });
}