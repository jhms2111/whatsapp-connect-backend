//buildQuestionAnswerContext.ts


import { sortAnswers, OnboardingAnswerRecord } from '../utils/answer';

export function buildQuestionAnswerContext(
  answers: OnboardingAnswerRecord[] = []
): string {
  const sortedAnswers = sortAnswers(answers);

  return sortedAnswers
    .filter((item) => item.question && item.answer)
    .map((item) => {
      if (item.language === 'es') {
        return `Pregunta: ${item.question}\nRespuesta: ${item.answer}`;
      }

      if (item.language === 'en') {
        return `Question: ${item.question}\nAnswer: ${item.answer}`;
      }

      return `Pergunta: ${item.question}\nResposta: ${item.answer}`;
    })
    .join('\n\n');
}