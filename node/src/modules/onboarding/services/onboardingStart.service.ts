import bcrypt from 'bcryptjs';

import User from '../../../infraestructure/mongo/models/userModel';

import { cleanEmail, cleanUsername } from '../utils/sanitize';

import { normalizeOnboarding } from '../core/normalizeOnboarding';
import { buildLlmContext } from '../core/buildLlmContext';

import { createOrUpdateOnboardingSession } from './onboardingSession.service';

function generateEmailCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function codeExpiry() {
  return new Date(Date.now() + 15 * 60 * 1000);
}

function sessionExpiry() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

export async function onboardingStartService(input: any) {
  const cleanMail = cleanEmail(input.email || input.account?.email);
  const cleanUser = cleanUsername(input.username);

  const normalized = normalizeOnboarding(input);
  const llmContext = buildLlmContext(normalized);

  const existingUser = await User.findOne({
    email: cleanMail,
  });

  if (existingUser && existingUser.emailVerified) {
    throw new Error('Este email já está registrado.');
  }

  const existingUsername = await User.findOne({
    username: cleanUser,
  });

  if (
    existingUsername &&
    existingUsername.email !== cleanMail
  ) {
    throw new Error('Este nome de usuário já está em uso.');
  }

  const verificationCode = generateEmailCode();
  const verificationCodeHash = await bcrypt.hash(verificationCode, 10);

  await createOrUpdateOnboardingSession({
    status: 'pending_email',

    language: normalized.language,

    domain: normalized.domain,

    taxonomy: normalized.taxonomy,

    answers: normalized.answers,

    answersMap: normalized.answersMap,

    domainProfile: normalized.domainProfile,

    llmContext,

    products: normalized.products,

    account: normalized.account,

    userEmail: cleanMail,

    username: cleanUser,

    emailVerificationCodeHash: verificationCodeHash,

    emailVerificationCodeExpiry: codeExpiry(),

    emailVerificationAttempts: 0,

    expiresAt: sessionExpiry(),
  });

  return {
    verificationCode,
    normalized,
    llmContext,
  };
}