// backend/src/modules/onboarding/services/meDashboard.service.ts

import Bot from '../../../infraestructure/mongo/models/botModel';
import OnboardingSession from '../../../infraestructure/mongo/models/onboardingDraftModel';
import RestaurantProfile from '../../../infraestructure/mongo/models/onboarding/restaurant/restaurantProfile.model';

export async function getMeDashboardService(username: string) {
  const cleanUsername = String(username || '').trim();

  if (!cleanUsername) {
    throw new Error('Username é obrigatório.');
  }

  const bot = await Bot.findOne({ owner: cleanUsername }).sort({
    createdAt: -1,
  });

  const session = await OnboardingSession.findOne({
    username: cleanUsername,
    status: 'completed',
  }).sort({
    completedAt: -1,
    createdAt: -1,
  });

  const domain = session?.domain || '';

  let domainData: any = null;

  if (domain === 'restaurant') {
    domainData = await RestaurantProfile.findOne({
      owner: cleanUsername,
    }).sort({
      createdAt: -1,
    });
  }

  return {
    username: cleanUsername,

    domain,

    businessName:
      bot?.companyName ||
      session?.account?.businessName ||
      domainData?.restaurantName ||
      '',

    botId: bot?._id || null,

    status: bot ? 'active' : 'pending',

    domainData,
  };
}