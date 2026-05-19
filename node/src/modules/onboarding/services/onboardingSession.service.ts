import OnboardingSession from '../../../infraestructure/mongo/models/onboarding/onboardingSession.model';

export async function findOnboardingSessionByEmail(email: string) {
  return OnboardingSession.findOne({
    userEmail: String(email).trim().toLowerCase(),
  });
}

export async function findPendingOnboardingSession(email: string) {
  return OnboardingSession.findOne({
    userEmail: String(email).trim().toLowerCase(),
    status: 'pending_email',
  });
}

export async function createOrUpdateOnboardingSession(payload: any) {
  return OnboardingSession.findOneAndUpdate(
    {
      userEmail: payload.userEmail,
    },
    payload,
    {
      upsert: true,
      new: true,
    }
  );
}

export async function completeOnboardingSession(
  sessionId: any,
  data: any = {}
) {
  return OnboardingSession.findByIdAndUpdate(
    sessionId,
    {
      status: 'completed',
      completedAt: new Date(),
      ...data,
    },
    {
      new: true,
    }
  );
}