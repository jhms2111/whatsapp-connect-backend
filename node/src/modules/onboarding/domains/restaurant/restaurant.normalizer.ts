//restaurant.normalizer.ts



import { arrayOrEmpty, valueOrEmpty } from '../../utils/value';

export function normalizeRestaurant(input: any) {
  const answersMap = input.answersMap || {};

  return {
    type: 'restaurant',

    subniche: valueOrEmpty(answersMap.restaurant_subniche),

    services: arrayOrEmpty(answersMap.restaurant_services),

    modules: arrayOrEmpty(answersMap.restaurant_modules),

    name: valueOrEmpty(answersMap.restaurant_name),

    description: valueOrEmpty(answersMap.restaurant_description),

    location: valueOrEmpty(answersMap.restaurant_location),

    openingHours: valueOrEmpty(answersMap.restaurant_opening_hours),

    serviceModes: arrayOrEmpty(answersMap.restaurant_service_modes),

    deliveryArea: valueOrEmpty(answersMap.restaurant_delivery_area),

    deliveryTime: valueOrEmpty(answersMap.restaurant_delivery_time),

    reservationPolicy: valueOrEmpty(answersMap.restaurant_reservation_policy),

    menuCategories: arrayOrEmpty(answersMap.restaurant_menu_categories),

    mainItems: valueOrEmpty(answersMap.restaurant_main_items),

    bestSellers: valueOrEmpty(answersMap.restaurant_best_sellers),

    paymentMethods: arrayOrEmpty(answersMap.restaurant_payment_methods),

    allergies: valueOrEmpty(answersMap.restaurant_allergies),

    restrictions: valueOrEmpty(answersMap.restaurant_restrictions),

    humanHandoff: arrayOrEmpty(answersMap.restaurant_human_handoff),

    forbiddenAnswers: valueOrEmpty(answersMap.restaurant_forbidden_answers),

    faq: valueOrEmpty(answersMap.restaurant_faq),

    website: valueOrEmpty(answersMap.restaurant_website),

    instagram: valueOrEmpty(answersMap.restaurant_instagram),

    whatsapp: valueOrEmpty(answersMap.restaurant_whatsapp),

    finalNotes: valueOrEmpty(answersMap.restaurant_final_notes),
  };
}