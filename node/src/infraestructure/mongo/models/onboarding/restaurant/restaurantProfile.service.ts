// backend/src/modules/onboarding/domains/restaurant/restaurantProfile.service.ts

import RestaurantProfile from './restaurantProfile.model';

function hasText(value: any) {
  return Boolean(String(value || '').trim());
}

export async function createRestaurantProfile({
  owner,
  botId,
  normalized,
}: {
  owner: string;
  botId: any;
  normalized: any;
}) {
  const answersMap = normalized.answersMap || {};
  const profile = normalized.domainProfile || {};

  const restaurantName =
    profile.name ||
    answersMap.restaurant_name ||
    normalized.account?.businessName ||
    '';

  const reservationPolicy =
    profile.reservationPolicy ||
    answersMap.restaurant_reservation_policy ||
    '';

  const orderPolicy =
    profile.orderPolicy ||
    answersMap.restaurant_order_policy ||
    '';

  const preparationTime =
    profile.preparationTime ||
    answersMap.restaurant_preparation_time ||
    '';

  const paymentMethods =
    Array.isArray(profile.paymentMethods) && profile.paymentMethods.length
      ? profile.paymentMethods
      : Array.isArray(answersMap.restaurant_payment_methods)
      ? answersMap.restaurant_payment_methods
      : [];

  const data = {
    owner,
    botId,

    restaurantName,

    subniche:
      profile.subniche ||
      answersMap.restaurant_subniche ||
      normalized.taxonomy?.subniche ||
      '',

    description:
      profile.description ||
      answersMap.restaurant_description ||
      '',

    location:
      profile.location ||
      answersMap.restaurant_location ||
      '',

    openingHours:
      profile.openingHours ||
      answersMap.restaurant_opening_hours ||
      '',

    reservationPolicy,

    orderPolicy,

    preparationTime,

    paymentMethods,

    mainDifferential:
      profile.mainDifferential ||
      answersMap.restaurant_main_differential ||
      '',

    recommendationBehavior:
      profile.recommendationBehavior ||
      answersMap.restaurant_recommendation_behavior ||
      '',

    restrictions:
      profile.restrictions ||
      answersMap.restaurant_restrictions ||
      '',

    contactCapture: Array.isArray(answersMap.restaurant_contact_capture)
      ? answersMap.restaurant_contact_capture
      : [],

    agentStyle:
      profile.agentStyle ||
      answersMap.restaurant_agent_style ||
      '',

    acceptsReservations: hasText(reservationPolicy),

    acceptsOrders: hasText(orderPolicy),

    acceptsDelivery:
      hasText(orderPolicy) ||
      String(orderPolicy).toLowerCase().includes('delivery'),

    rawProfile: profile,
  };

  return RestaurantProfile.findOneAndUpdate(
    {
      owner,
      botId,
    },
    data,
    {
      upsert: true,
      new: true,
    }
  );
}