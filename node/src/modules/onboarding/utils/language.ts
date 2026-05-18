export type Lang = 'pt' | 'es' | 'en';

export function getLang(value: any): Lang {
  if (value === 'es') return 'es';
  if (value === 'en') return 'en';

  return 'pt';
}

export function getQuestionLabelByLang(lang: Lang) {
  if (lang === 'es') {
    return {
      question: 'Pregunta',
      answer: 'Respuesta',
    };
  }

  if (lang === 'en') {
    return {
      question: 'Question',
      answer: 'Answer',
    };
  }

  return {
    question: 'Pergunta',
    answer: 'Resposta',
  };
}