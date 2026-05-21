//answer.ts


import { getLang, Lang } from './language';

export type OnboardingAnswerRecord = {
  questionId: string;
  section: string;
  language: Lang;

  question: string;
  answer: string;

  rawValue: any;
  normalizedValue: any;

  answerType: string;
  order: number;
};

export function sortAnswers(
  answers: OnboardingAnswerRecord[] = []
): OnboardingAnswerRecord[] {
  return [...answers].sort((a, b) => {
    return Number(a.order || 0) - Number(b.order || 0);
  });
}

export function cleanAnswers(answers: any[] = []): OnboardingAnswerRecord[] {
  if (!Array.isArray(answers)) return [];

  return answers
    .filter((item) => item && item.questionId && item.question)
    .map((item) => ({
      questionId: String(item.questionId || ''),
      section: String(item.section || 'general'),

      language: getLang(item.language),

      question: String(item.question || ''),
      answer: String(item.answer || ''),

      rawValue: item.rawValue,

      normalizedValue:
        item.normalizedValue !== undefined
          ? item.normalizedValue
          : item.rawValue,

      answerType: String(item.answerType || 'text'),

      order: Number(item.order || 0),
    }));
}

export function answersToMap(answers: OnboardingAnswerRecord[] = []) {
  if (!Array.isArray(answers)) return {};

  return answers.reduce<Record<string, any>>((acc, item) => {
    acc[item.questionId] = item.rawValue;
    return acc;
  }, {});
}