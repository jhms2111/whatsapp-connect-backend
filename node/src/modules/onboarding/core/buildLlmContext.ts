//buildLlmContext.ts



import { buildQuestionAnswerContext } from './buildQuestionAnswerContext';
import { getOnboardingDomain } from './registry';

export function buildLlmContext(normalized: any) {
  const domainConfig = getOnboardingDomain(normalized.domain);

  const questionAnswerText = buildQuestionAnswerContext(
    normalized.answers || []
  );

  const domainSummary = domainConfig?.buildSummary
    ? domainConfig.buildSummary(normalized)
    : '';

  const structured = {
    language: normalized.language,

    taxonomy: normalized.taxonomy,

    account: {
      businessName:
        normalized.account?.businessName || '',
      email: normalized.account?.email || '',
      phone: normalized.account?.phone || '',
    },

    assistant: {
      personality:
        normalized.answersMap?.assistant_personality ||
        normalized.answersMap?.collection_agent_tone ||
        '',

      goals:
        normalized.answersMap?.assistant_goal ||
        normalized.answersMap?.collection_negotiation_goal ||
        [],

      responseStyle:
        normalized.answersMap?.response_style ||
        normalized.answersMap?.collection_approach_style ||
        '',

      salesBehavior:
        normalized.answersMap?.sales_behavior ||
        normalized.answersMap?.collection_allowed_negotiation ||
        '',

      humanHandoff:
        normalized.answersMap?.human_handoff_global ||
        normalized.answersMap?.collection_human_confirmation ||
        [],
    },

    domainProfile:
      normalized.domainProfile || {},

    products:
      normalized.products || [],

    debtors:
      normalized.debtors || [],
  };

  return {
    language: normalized.language,
    summary: domainSummary,
    structured,
    questionAnswerText,
  };
}