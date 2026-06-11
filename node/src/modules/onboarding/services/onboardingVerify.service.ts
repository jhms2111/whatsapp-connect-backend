//onboardingVerify.service.ts



import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import User from '../../../infraestructure/mongo/models/userModel';
import WebchatQuota from '../../../infraestructure/mongo/models/webchatQuotaModel';

import { normalizeOnboarding } from '../core/normalizeOnboarding';
import { buildLlmContext } from '../core/buildLlmContext';

import {
  completeOnboardingSession,
  findPendingOnboardingSession,
} from './onboardingSession.service';

import { onboardingCompletionService } from './onboardingCompletion.service';

const WELCOME_CREDITS = 100;

async function grantWelcomeCredits(username: string) {
  const now = new Date();

  const periodStart = now;
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await WebchatQuota.findOneAndUpdate(
    { username },
    {
      $inc: {
        totalConversations: WELCOME_CREDITS,
      },
      $setOnInsert: {
        username,
        usedCharacters: 0,
        packageType: null,
        lastStripeCheckoutId: null,
        coins: 0,
        coinsExpiresAt: null,
        createdAt: now,
      },
      $set: {
        periodStart,
        periodEnd,
        updatedAt: now,
      },
    },
    {
      upsert: true,
      new: true,
    }
  );
}

export async function onboardingVerifyService({
  email,
  code,
}: {
  email: string;
  code: string;
}) {
  const session = await findPendingOnboardingSession(email);

  if (!session) {
    throw new Error('Onboarding não encontrado.');
  }

  if (
    !session.emailVerificationCodeExpiry ||
    session.emailVerificationCodeExpiry.getTime() < Date.now()
  ) {
    throw new Error('Código expirado.');
  }

  if ((session.emailVerificationAttempts || 0) >= 5) {
    throw new Error('Muitas tentativas. Solicite um novo código.');
  }

  const validCode = await bcrypt.compare(
    String(code).trim(),
    session.emailVerificationCodeHash || ''
  );

  if (!validCode) {
    session.emailVerificationAttempts =
      (session.emailVerificationAttempts || 0) + 1;

    await session.save();

    throw new Error('Código inválido.');
  }

  const user = await User.findOne({
    email: session.userEmail,
  });

  if (!user) {
    throw new Error('Usuário não encontrado para este onboarding.');
  }

  user.emailVerified = true;
  await user.save();

  const normalized = normalizeOnboarding({
    language: session.language,
    domain: session.domain,
    taxonomy: session.taxonomy,
    answers: session.answers,
    answersMap: session.answersMap,
    products: session.products,
    debtors: session.debtors,
    account: session.account,
  });

  const llmContext = buildLlmContext(normalized);

  const { bot } = await onboardingCompletionService({
    session,
    normalized,
    llmContext,
  });

  await grantWelcomeCredits(session.username);

  await completeOnboardingSession(session._id, {
    createdBotId: bot._id,
    emailVerificationCodeHash: '',
    emailVerificationCodeExpiry: null,
    emailVerificationAttempts: 0,
  });

  const token = jwt.sign(
    {
      id: user._id,
      username: user.username,
      role: user.role,
    },
    process.env.JWT_SECRET || 'secret',
    {
      expiresIn: '7d',
    }
  );

  return {
    token,
    username: session.username,
    botId: bot._id,
    businessName: normalized.account.businessName,
    chatUrl: `${
      process.env.FRONTEND_URL || 'http://localhost:3000'
    }/chat/${session.username}`,
    welcomeCreditsGranted: WELCOME_CREDITS,
  };
}