import { arrayOrEmpty, valueOrEmpty } from '../../utils/value';

function normalizeDebtors(debtors: any[] = []) {
  if (!Array.isArray(debtors)) return [];

  return debtors
    .map((item) => ({
      debtorName: valueOrEmpty(item?.debtorName),
      documentReference: valueOrEmpty(item?.documentReference),
      debtAmount: valueOrEmpty(item?.debtAmount),
      dueDate: valueOrEmpty(item?.dueDate),
      debtOrigin: valueOrEmpty(item?.debtOrigin),
      paymentMethods: arrayOrEmpty(item?.paymentMethods),
      maxInstallments: valueOrEmpty(item?.maxInstallments),
      interestPolicy: valueOrEmpty(item?.interestPolicy),
      discountPolicy: valueOrEmpty(item?.discountPolicy),
      negotiationNotes: valueOrEmpty(item?.negotiationNotes),
      debtorEmail: valueOrEmpty(item?.debtorEmail),
    }))
    .filter(
      (item) =>
        item.debtorName ||
        item.documentReference ||
        item.debtAmount ||
        item.debtOrigin
    );
}

export function normalizeDebtCollection(input: any) {
  const answersMap = input.answersMap || {};

  return {
    type: 'debt_collection',

    companyName: valueOrEmpty(answersMap.collection_company_name),

    businessType: valueOrEmpty(answersMap.collection_business_type),

    debtTypes: arrayOrEmpty(answersMap.collection_debt_type),

    agentTone: valueOrEmpty(answersMap.collection_agent_tone),

    approachStyle: valueOrEmpty(answersMap.collection_approach_style),

    negotiationGoal: arrayOrEmpty(answersMap.collection_negotiation_goal),

    allowedNegotiation: arrayOrEmpty(
      answersMap.collection_allowed_negotiation
    ),

    paymentMethods: arrayOrEmpty(answersMap.collection_payment_methods),

    installmentsPolicy: valueOrEmpty(
      answersMap.collection_installments_policy
    ),

    interestPolicy: valueOrEmpty(answersMap.collection_interest_policy),

    requiredData: arrayOrEmpty(answersMap.collection_required_data),

    emailRequired: valueOrEmpty(answersMap.collection_email_required),

    humanConfirmation: valueOrEmpty(
      answersMap.collection_human_confirmation
    ),

    disputePolicy: valueOrEmpty(answersMap.collection_dispute_policy),

    forbiddenBehavior: arrayOrEmpty(
      answersMap.collection_forbidden_behavior
    ),

    debtors: normalizeDebtors(input.debtors || []),
  };
}