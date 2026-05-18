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
        normalized.answersMap?.assistant_personality || '',

      goals:
        normalized.answersMap?.assistant_goal || [],

      responseStyle:
        normalized.answersMap?.response_style || '',

      salesBehavior:
        normalized.answersMap?.sales_behavior || '',

      humanHandoff:
        normalized.answersMap?.human_handoff_global || [],
    },

    domainProfile:
      normalized.domainProfile || {},

    products:
      normalized.products || [],
  };

  return {
    language: normalized.language,
    summary: domainSummary,
    structured,
    questionAnswerText,
  };
}