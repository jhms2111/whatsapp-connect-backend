import DebtCollectionProfile from './debtCollectionProfile.model';

export async function createDebtCollectionProfile({
  owner,
  botId,
  normalized,
}: {
  owner: string;
  botId: any;
  normalized: any;
}) {
  const profile = normalized.domainProfile || {};
  const answersMap = normalized.answersMap || {};

  const data = {
    owner,
    botId,

    companyName:
      profile.companyName ||
      answersMap.collection_company_name ||
      normalized.account?.businessName ||
      '',

    businessType:
      profile.businessType ||
      answersMap.collection_business_type ||
      '',

    debtTypes: Array.isArray(profile.debtTypes)
      ? profile.debtTypes
      : Array.isArray(answersMap.collection_debt_type)
      ? answersMap.collection_debt_type
      : [],

    agentTone:
      profile.agentTone ||
      answersMap.collection_agent_tone ||
      '',

    approachStyle:
      profile.approachStyle ||
      answersMap.collection_approach_style ||
      '',

    negotiationGoal: Array.isArray(profile.negotiationGoal)
      ? profile.negotiationGoal
      : Array.isArray(answersMap.collection_negotiation_goal)
      ? answersMap.collection_negotiation_goal
      : [],

    allowedNegotiation: Array.isArray(profile.allowedNegotiation)
      ? profile.allowedNegotiation
      : Array.isArray(answersMap.collection_allowed_negotiation)
      ? answersMap.collection_allowed_negotiation
      : [],

    paymentMethods: Array.isArray(profile.paymentMethods)
      ? profile.paymentMethods
      : Array.isArray(answersMap.collection_payment_methods)
      ? answersMap.collection_payment_methods
      : [],

    installmentsPolicy:
      profile.installmentsPolicy ||
      answersMap.collection_installments_policy ||
      '',

    interestPolicy:
      profile.interestPolicy ||
      answersMap.collection_interest_policy ||
      '',

    requiredData: Array.isArray(profile.requiredData)
      ? profile.requiredData
      : Array.isArray(answersMap.collection_required_data)
      ? answersMap.collection_required_data
      : [],

    emailRequired:
      profile.emailRequired ||
      answersMap.collection_email_required ||
      '',

    humanConfirmation:
      profile.humanConfirmation ||
      answersMap.collection_human_confirmation ||
      '',

    disputePolicy:
      profile.disputePolicy ||
      answersMap.collection_dispute_policy ||
      '',

    forbiddenBehavior: Array.isArray(profile.forbiddenBehavior)
      ? profile.forbiddenBehavior
      : Array.isArray(answersMap.collection_forbidden_behavior)
      ? answersMap.collection_forbidden_behavior
      : [],

    debtors: Array.isArray(profile.debtors) ? profile.debtors : [],

    rawProfile: profile,
  };

  return DebtCollectionProfile.findOneAndUpdate(
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