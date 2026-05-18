import { normalizeRestaurant } from './restaurant.normalizer';

import {
  buildRestaurantSummary,
  buildRestaurantPersona,
  buildRestaurantGuidelines,
} from './restaurant.prompt';

import { getRestaurantCollectionTitle } from './restaurant.catalog';

export default {
  id: 'restaurant',

  normalize: normalizeRestaurant,

  buildSummary: buildRestaurantSummary,

  buildPersona: buildRestaurantPersona,

  buildGuidelines: buildRestaurantGuidelines,

  getCollectionTitle: getRestaurantCollectionTitle,
};