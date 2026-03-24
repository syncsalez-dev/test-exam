import { useState, useMemo } from 'react';

export interface Card {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export const useQuiz = (initialCards: Card[]) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [isFinished, setIsFinished] = useState(false);

  const currentCard = initialCards[currentIndex];

  const nextCard = (isCorrect: boolean) => {
    if (isCorrect) {
      setScore(s => ({ ...s, correct: s.correct + 1 }));
    } else {
      setScore(s => ({ ...s, incorrect: s.incorrect + 1 }));
    }

    if (currentIndex < initialCards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsFinished(true);
    }
  };

  const restart = () => {
    setCurrentIndex(0);
    setScore({ correct: 0, incorrect: 0 });
    setIsFinished(false);
  };

  const progress = useMemo(() => {
    return ((currentIndex + 1) / initialCards.length) * 100;
  }, [currentIndex, initialCards.length]);

  return {
    currentCard,
    currentIndex,
    totalCards: initialCards.length,
    score,
    isFinished,
    progress,
    nextCard,
    restart
  };
};
