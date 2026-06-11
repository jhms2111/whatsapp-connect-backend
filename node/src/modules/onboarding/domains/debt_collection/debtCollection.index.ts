import { normalizeDebtCollection } from './debtCollection.normalizer';

import {
  buildDebtCollectionSummary,
  buildDebtCollectionPersona,
  buildDebtCollectionGuidelines,
} from './debtCollection.prompt';

import { getDebtCollectionCollectionTitle } from './debtCollection.catalog';

export default {
  id: 'debt_collection',

  normalize: normalizeDebtCollection,

  buildSummary: buildDebtCollectionSummary,

  buildPersona: buildDebtCollectionPersona,

  buildGuidelines: buildDebtCollectionGuidelines,

  getCollectionTitle: getDebtCollectionCollectionTitle,
};