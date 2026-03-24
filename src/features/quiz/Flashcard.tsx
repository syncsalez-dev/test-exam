import React, { useState } from 'react';
import { cn } from '../../lib/icons/phosphor';
import { ArrowsClockwiseIcon } from '../../lib/icons/phosphor';

interface FlashcardProps {
  question: string;
  answer: string;
  category?: string;
}

export const Flashcard: React.FC<FlashcardProps> = ({ question, answer, category }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="group perspective-1000 w-full max-w-md h-64 cursor-pointer"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div className={cn(
        "relative w-full h-full transition-all duration-500 preserve-3d",
        isFlipped ? "rotate-y-180" : ""
      )}>
        {/* Front Side */}
        <div className="absolute inset-0 w-full h-full backface-hidden">
          <div className="h-full w-full p-6 rounded-2xl bg-card border border-border shadow-sm flex flex-col justify-between hover:border-primary/50 transition-colors">
            <div className="flex justify-between items-start">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {category || 'General'}
              </span>
              <ArrowsClockwiseIcon className="text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="flex-1 flex items-center justify-center text-center">
              <h3 className="text-xl font-semibold text-foreground leading-tight">
                {question}
              </h3>
            </div>
            <p className="text-xs text-center text-muted-foreground italic">
              Tap to reveal answer
            </p>
          </div>
        </div>

        {/* Back Side */}
        <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180">
          <div className="h-full w-full p-6 rounded-2xl bg-primary text-primary-foreground border border-primary shadow-lg flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-medium opacity-80 uppercase tracking-wider">
                Answer
              </span>
            </div>
            <div className="flex-1 flex items-center justify-center text-center">
              <p className="text-lg font-medium leading-relaxed">
                {answer}
              </p>
            </div>
            <div className="h-4" /> {/* Spacer */}
          </div>
        </div>
      </div>
    </div>
  );
};
