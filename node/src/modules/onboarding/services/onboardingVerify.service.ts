import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import User from '../../../infraestructure/mongo/models/userModel';

import { normalizeOnboarding } from '../core/normalizeOnboarding';
import { buildLlmContext } from '../core/buildLlmContext';

import {
  completeOnboardingSession,
  findPendingOnboardingSession,
} from './onboardingSession.service';

import { onboardingCompletionService } from './onboardingCompletion.service';

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

  let user = await User.findOne({
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
    account: session.account,
  });

  const llmContext = buildLlmContext(normalized);

  const { bot } = await onboardingCompletionService({
    session,
    normalized,
    llmContext,
  });

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
  };
}