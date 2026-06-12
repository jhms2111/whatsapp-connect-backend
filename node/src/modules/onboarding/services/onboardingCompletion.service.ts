//onboardingCompletion.service.ts

import CatalogCollection from '../../../infraestructure/mongo/models/catalogCollectionModel';
import CatalogItem from '../../../infraestructure/mongo/models/catalogItemModel';
import Bot from '../../../infraestructure/mongo/models/botModel';

import { createDomainProfile } from '../core/domainProfileRegistry';

import { buildBotPayload } from '../core/buildBotPayload';

import {
  buildCatalogItemPayload,
  buildDebtCatalogItemPayload,
  buildFallbackCatalogItem,
  getCollectionTitle,
} from '../core/buildCatalogPayload';

export async function onboardingCompletionService({
  session,
  normalized,
  llmContext,
}: {
  session: any;
  normalized: any;
  llmContext: any;
}) {
  const username = session.username;

  const collection = await CatalogCollection.create({
    owner: username,
    title: getCollectionTitle(normalized.domain),
    fields: [],
  });

  const catalogItemIds: any[] = [];

  if (
    normalized.domain === 'debt_collection' &&
    Array.isArray(normalized.debtors) &&
    normalized.debtors.length > 0
  ) {
    for (const debtor of normalized.debtors) {
      const item = await CatalogItem.create({
        owner: username,
        collectionId: collection._id,
        ...buildDebtCatalogItemPayload(debtor),
      });

      catalogItemIds.push(item._id);
    }
  }

  if (
    normalized.domain !== 'debt_collection' &&
    Array.isArray(normalized.products) &&
    normalized.products.length > 0
  ) {
    for (const product of normalized.products) {
      const item = await CatalogItem.create({
        owner: username,
        collectionId: collection._id,
        ...buildCatalogItemPayload(product),
      });

      catalogItemIds.push(item._id);
    }
  }

  if (catalogItemIds.length === 0) {
    const fallback = await CatalogItem.create({
      owner: username,
      collectionId: collection._id,
      ...buildFallbackCatalogItem({
        ...normalized,
        llmContext,
      }),
    });

    catalogItemIds.push(fallback._id);
  }

  const botPayload = buildBotPayload({
    normalized,
    llmContext,
    catalogItemIds,
    username,
  });

  const bot = await Bot.create(botPayload);

  await createDomainProfile({
    domain: normalized.domain,
    owner: username,
    botId: bot._id,
    normalized,
  });

  return {
    bot,
    catalogItemIds,
  };
}