import { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircleIcon, 
  XIcon, 
  SpeakerHighIcon, 
  SpeakerSlashIcon, 
  CaretRightIcon,
  LightningIcon,
  cn 
} from './lib/icons/phosphor';

interface ReadingTrainerProps {
  text: string;
  wpm: number;
  onClose: () => void;
  onFinish: () => void;
  isHighLikelihood?: boolean;
}

const ReadingTrainer = ({ text, wpm, onClose, onFinish, isHighLikelihood }: ReadingTrainerProps) => {
  const chunks = useMemo(() => {
    const rawWords = text.split(/\s+/).filter(w => w.length > 0);
    const result: string[] = [];
    let current: string[] = [];
    let currentLen = 0;

    rawWords.forEach(word => {
      if ((currentLen + word.length > 22 && current.length > 0) || current.length >= 3) {
        result.push(current.join(' '));
        current = [word];
        currentLen = word.length;
      } else {
        current.push(word);
        currentLen += word.length + 1;
      }
      if (/[.!?]$/.test(word)) {
        result.push(current.join(' '));
        current = [];
        currentLen = 0;
      }
    });
    if (current.length > 0) result.push(current.join(' '));
    return result;
  }, [text]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(wpm);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  
  // High-Density Centering Constants
  const ROW_HEIGHT = 80; 
  const VIEWPORT_HEIGHT = 240; 
  const CENTER_OFFSET = (VIEWPORT_HEIGHT / 2) - (ROW_HEIGHT / 2); // 80px

  // Timing Logic
  useEffect(() => {
    if (!isPlaying || currentIdx >= chunks.length) return;
    
    const currentChunk = chunks[currentIdx];
    let multiplier = 1;

    if (/[.!?]$/.test(currentChunk)) multiplier = 2.4;
    else if (/[,;:]$/.test(currentChunk)) multiplier = 1.8;
    
    const baseInterval = (60000 / speed) * 2.2; 
    const lengthFactor = isAudioEnabled ? 0.05 : 0.02;
    multiplier *= (1 + (currentChunk.length * lengthFactor));

    const timer = setTimeout(() => {
      setCurrentIdx(prev => prev + 1);
    }, baseInterval * multiplier);
    
    return () => clearTimeout(timer);
  }, [currentIdx, isPlaying, speed, chunks.length, isAudioEnabled, chunks]);

  // Audio Sync
  useEffect(() => {
    window.speechSynthesis.cancel();
    if (isAudioEnabled && isPlaying && currentIdx < chunks.length) {
      const utterance = new SpeechSynthesisUtterance(chunks[currentIdx]);
      utterance.rate = Math.max(0.6, Math.min(4, speed / 135));
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
    return () => window.speechSynthesis.cancel();
  }, [currentIdx, isAudioEnabled, isPlaying, speed, chunks]);

  return (
    <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-3xl overflow-y-auto python-scrollbar-hide animate-in fade-in duration-500">
      <div className="min-h-full flex flex-col items-center justify-start py-12 md:py-20 px-8">
        <div className="w-full max-w-[90vw] min-h-[80vh] flex flex-col items-center justify-between gap-12">
          
          {/* Header Metadata */}
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="bg-primary/10 px-4 py-1.5 rounded-full">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Mindful Reading Focus</span>
            </div>
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest opacity-25">
              Phrase {currentIdx + 1} of {chunks.length}
            </p>
            {isHighLikelihood && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-warning/20 border border-warning/30 rounded-full animate-pulse shadow-lg shadow-warning/10">
                <LightningIcon size={12} weight="fill" className="text-warning" />
                <span className="text-[9px] font-black text-warning uppercase tracking-widest">High Likelihood Focus</span>
              </div>
            )}
          </div>

          {/* Ultra-Wide, Dense Carousel Pane */}
          <div 
            style={{ height: VIEWPORT_HEIGHT }}
            className="w-full relative overflow-hidden bg-primary/[0.015] rounded-3xl"
          >
            <div className="absolute top-1/2 left-0 right-0 h-16 md:h-20 bg-primary/[0.04] -translate-y-1/2 pointer-events-none transition-all" />
            
            <div 
              className="absolute inset-x-0 transition-transform duration-500 ease-out will-change-transform"
              style={{ transform: `translateY(${CENTER_OFFSET - (currentIdx * ROW_HEIGHT)}px)` }}
            >
              {chunks.map((phrase, i) => (
                <div 
                  key={i} 
                  style={{ height: ROW_HEIGHT }}
                  className="flex items-center justify-center w-full px-4 md:px-12 shrink-0"
                >
                  <div className={cn(
                    "max-w-[85%] text-center transition-all duration-500 transform tracking-tight select-none pointer-events-none leading-none",
                    i === currentIdx 
                      ? "text-3xl md:text-5xl lg:text-7xl font-black text-foreground scale-100 opacity-100" 
                      : "text-lg md:text-xl font-bold opacity-10 scale-90"
                  )}>
                    {phrase}
                  </div>
                </div>
              ))}
              
              <div 
                style={{ height: ROW_HEIGHT }}
                className="flex items-center justify-center w-full shrink-0"
              >
                <div className="flex flex-col items-center gap-6 animate-in slide-in-from-bottom-8 duration-700">
                  <CheckCircleIcon size={48} className="text-success" />
                  <button onClick={onFinish} className="px-12 py-5 bg-primary text-primary-foreground rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/30 active:scale-95 transition-all">
                    Complete Session
                  </button>
                </div>
              </div>
            </div>

            {currentIdx < chunks.length && (
              <div className="absolute inset-y-0 left-4 md:left-20 right-4 md:right-20 flex items-center justify-between pointer-events-none z-10 opacity-15">
                <div className="w-1 h-6 bg-primary/40 rounded-full" />
                <div className="w-1 h-6 bg-primary/40 rounded-full" />
              </div>
            )}
          </div>

          {/* Controls - Balanced with p-4 padding for ergonomic reach */}
          <div className="w-full max-w-lg space-y-10 animate-in slide-in-from-bottom-10 duration-1000">
            <div className="bg-secondary/30 h-1 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(currentIdx / chunks.length) * 100}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-4 px-1">
              <div className="flex-1 flex flex-col gap-3">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Pace</span>
                  <span className="text-[10px] font-black text-primary tabular-nums">{speed} WPM</span>
                </div>
                <input 
                  type="range" min="100" max="500" step="10" 
                  value={speed} onChange={e => setSpeed(parseInt(e.target.value))}
                  className="w-full accent-primary h-1 bg-secondary rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Main Controls with p-4 as requested */}
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-15 h-15 md:w-16 md:h-16 p-2 bg-primary text-primary-foreground rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-primary/20 active:scale-90 transition-all"
              >
                {isPlaying ? <XIcon size={24} /> : <div className="ml-1 w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-current border-b-[8px] border-b-transparent" />}
              </button>

              <button 
                onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                className={cn(
                  "w-15 h-15 md:w-16 md:h-16 p-2 rounded-[1.5rem] flex items-center justify-center transition-all active:scale-90 border border-border/10 shadow-sm",
                  isAudioEnabled ? "bg-warning/10 text-warning border-warning/10 shadow-inner" : "bg-secondary/40 text-muted-foreground"
                )}
              >
                {isAudioEnabled ? <SpeakerHighIcon size={22} weight="fill" /> : <SpeakerSlashIcon size={22} />}
              </button>
              
              <button 
                onClick={() => setCurrentIdx(Math.max(0, currentIdx - 3))}
                className="w-15 h-14 md:w-16 md:h-14 p-2 bg-secondary/50 rounded-2xl flex items-center justify-center text-muted-foreground active:scale-90 transition-all border border-border/5"
              >
                <div className="rotate-180">
                  <CaretRightIcon size={22} weight="bold" />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <button onClick={onClose} className="fixed top-6 right-6 p-2.5 bg-secondary/90 rounded-full text-muted-foreground hover:bg-secondary transition-all active:scale-95 shadow-xl backdrop-blur-md border border-border/10 z-[210]">
        <XIcon size={18} />
      </button>
    </div>
  );
};

export default ReadingTrainer;
