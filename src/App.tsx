import { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithCustomToken, 
  type User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  deleteDoc 
} from 'firebase/firestore';
import { 
  BookOpenIcon,
  ChartBarIcon,
  BrainIcon,
  CheckCircleIcon,
  ClockIcon, 
  CaretRightIcon, 
  WarningCircleIcon, 
  TargetIcon, 
  LightningIcon, 
  TimerIcon, 
  CircleNotchIcon, 
  PlusIcon, 
  TrashIcon, 
  ArrowLeftIcon,
  GraduationCapIcon,
  MagnifyingGlassIcon,
  XIcon,
  StackIcon,
  ActivityIcon,
  LightningSlashIcon,
  CopyIcon,
  TerminalWindowIcon,
  InfoIcon,
  cn
} from './lib/icons/phosphor';

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyAi0XycOZEPzQECZa1pMrJa7RUXYvy28Uo",
  authDomain: "test-app-7f48d.firebaseapp.com",
  projectId: "test-app-7f48d",
  storageBucket: "test-app-7f48d.firebasestorage.app",
  messagingSenderId: "986379095921",
  appId: "1:986379095921:web:eee5b298eb76b59e4330d0",
  measurementId: "G-W5SQPV3KVE"
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
// @ts-ignore
const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'test-app-7f48d';

// --- SRS CONFIGURATION ---
const REVIEW_INTERVALS = [0, 10, 60, 1440, 4320, 10080];
const QUESTION_TIMEOUT = 30; // 30 seconds per question

interface Question {
  num: number;
  unit: string;
  q: string;
  options: string[];
  correct: number;
  answer: string;
  explanation: string;
  page?: string;
  srsBox: number;
  nextReview: number;
  attempts: number;
  correctCount: number;
  totalSecondsTaken: number;
}

interface Subject {
  id: string;
  name: string;
  questions: Question[];
  streak: number;
  createdAt: number;
}

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [view, setView] = useState('dashboard'); // 'dashboard', 'quiz', 'stats', 'exam'
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active Subject State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  
  // Timer States
  const [quizTimer, setQuizTimer] = useState(QUESTION_TIMEOUT);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [lastTimeTaken, setLastTimeTaken] = useState(0);
  const quizIntervalRef = useRef<any>(null);

  // Exam States
  const [examActive, setExamActive] = useState(false);
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [examCurrentIdx, setExamCurrentIdx] = useState(0);
  const [examAnswers, setExamAnswers] = useState<number[]>([]);
  const [examTimer, setExamTimer] = useState(1200);
  const [examResult, setExamResult] = useState<number | null>(null);

  const generatorPrompt = `Prompt: I am attaching a course PDF. I need you to act as an expert educator and data engineer. 
Your task is to build a repository of exam-relevant multiple-choice questions based EXCLUSIVELY on this material.

Requirements:
1. Extract at least 100-200 high-quality questions (or more if requested).
2. For every question, provide:
   - "q": The question text.
   - "options": An array of exactly 4 strings.
   - "correct": The index (0, 1, 2, or 3) of the correct answer.
   - "answer": The string text of the correct answer.
   - "explanation": A detailed breakdown of why this answer is correct and why others are wrong.
   - "page": The specific page number reference from the PDF.
   - "unit": The Chapter/Unit identifier (e.g., "Unit 1" or "Chapter 2").

Output strictly in this JSON format:
{
  "questions": [
    {
      "unit": "U1",
      "q": "Example question text?",
      "options": ["A", "B", "C", "D"],
      "correct": 1,
      "answer": "B",
      "explanation": "Detail reference...",
      "page": "p. 12"
    }
  ]
}`;

  // 1. Auth Init
  useEffect(() => {
    const initAuth = async () => {
      try {
        // @ts-ignore
        if (typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
          // @ts-ignore
          await signInWithCustomToken(auth, window.__initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err: any) {
        console.error("Auth error:", err);
        setAuthError(err.message || "Failed to initialize authentication.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Fetch Subjects List
  useEffect(() => {
    if (!user) return;
    const subjectsRef = collection(db, 'artifacts', appId, 'subjects');
    const unsubscribe = onSnapshot(subjectsRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject));
      setSubjects(list);
    }, (error) => {
      console.error("Firestore error:", error);
    });
    return () => unsubscribe();
  }, [user]);

  // 3. Quiz Timer Logic
  useEffect(() => {
    if (view === 'quiz' && currentQuestionIndex !== null && !showExplanation) {
      setQuizTimer(QUESTION_TIMEOUT);
      setStartTime(Date.now());
      
      quizIntervalRef.current = setInterval(() => {
        setQuizTimer((prev) => {
          if (prev <= 1) {
            handleAnswer(-1); // Auto-fail on timeout
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(quizIntervalRef.current);
    }
    return () => clearInterval(quizIntervalRef.current);
  }, [view, currentQuestionIndex, showExplanation]);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(generatorPrompt);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const selectSubject = (subject: Subject) => {
    setActiveSubjectId(subject.id);
    const qs = subject.questions || [];
    setQuestions(qs);
    setView('quiz');
    pickNextQuestion(qs);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (!e.target?.result) return;
        const json = JSON.parse(e.target.result as string);
        const subjectName = file.name.replace('.json', '').toUpperCase();
        const rawQuestions = Array.isArray(json) ? json : (json.questions || []);
        
        if (rawQuestions.length === 0) return;

        const questionsToSave = rawQuestions.map((q: any, idx: number) => ({
          ...q,
          num: q.num || idx + 1,
          srsBox: 0,
          nextReview: Date.now(),
          attempts: 0,
          correctCount: 0,
          totalSecondsTaken: 0 
        }));

        const subjectId = `subject_${Date.now()}`;
        await setDoc(doc(db, 'artifacts', appId, 'subjects', subjectId), {
          name: subjectName,
          questions: questionsToSave,
          createdAt: Date.now(),
          streak: 0
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) { console.error("Invalid JSON format", err); }
    };
    reader.readAsText(file);
  };

  const saveActiveSubject = async (updatedQuestions: Question[]) => {
    if (!activeSubjectId) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'subjects', activeSubjectId), {
        questions: updatedQuestions,
        lastUpdated: Date.now()
      }, { merge: true });
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const pickNextQuestion = (allQuestions = questions) => {
    if (!allQuestions || allQuestions.length === 0) {
      setCurrentQuestionIndex(null);
      return;
    }
    const pool = allQuestions.filter(q => q.nextReview <= Date.now());
    if (pool.length > 0) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      const questionInMainList = allQuestions.findIndex(q => q.num === pool[randomIndex].num);
      setCurrentQuestionIndex(questionInMainList);
    } else {
      setCurrentQuestionIndex(null);
    }
    setShowExplanation(false);
    setSelectedOption(null);
  };

  const handleAnswer = (index: number) => {
    if (selectedOption !== null || currentQuestionIndex === null || !startTime) return;
    
    const timeNow = Date.now();
    const elapsed = Math.min((timeNow - startTime) / 1000, QUESTION_TIMEOUT);
    setLastTimeTaken(elapsed);
    clearInterval(quizIntervalRef.current);

    setSelectedOption(index);
    const isCorrect = index === questions[currentQuestionIndex].correct;
    
    const updatedQuestions = [...questions];
    const q = updatedQuestions[currentQuestionIndex];
    q.attempts = (q.attempts || 0) + 1;
    q.totalSecondsTaken = (q.totalSecondsTaken || 0) + elapsed;

    if (isCorrect) {
      q.srsBox = Math.min((q.srsBox || 0) + 1, REVIEW_INTERVALS.length - 1);
      q.correctCount = (q.correctCount || 0) + 1;
    } else {
      q.srsBox = 0;
    }
    
    q.nextReview = Date.now() + (REVIEW_INTERVALS[q.srsBox] * 60000);
    setQuestions(updatedQuestions);
    setShowExplanation(true);
    saveActiveSubject(updatedQuestions);
  };

  const startExam = () => {
    if (questions.length === 0) return;
    const pool = [...questions].sort(() => 0.5 - Math.random()).slice(0, Math.min(questions.length, 20));
    setExamQuestions(pool);
    setExamCurrentIdx(0);
    setExamAnswers([]);
    setExamActive(true);
    setExamResult(null);
    setExamTimer(1200);
  };

  const finishExam = () => {
    let correct = 0;
    examQuestions.forEach((q, i) => {
      if (examAnswers[i] === q.correct) correct++;
    });
    setExamResult(Math.round((correct / (examQuestions.length || 1)) * 100));
    setExamActive(false);
  };

  const deleteSubject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'subjects', id));
      if (activeSubjectId === id) {
        setView('dashboard');
        setActiveSubjectId(null);
      }
    } catch (err) { console.error(err); }
  };

  // --- DERIVED ---
  const currentQ = useMemo(() => {
    return (currentQuestionIndex !== null && questions[currentQuestionIndex]) ? questions[currentQuestionIndex] : null;
  }, [currentQuestionIndex, questions]);

  const forecast = useMemo(() => {
    const attempted = questions.filter(q => q.attempts > 0);
    if (attempted.length === 0) return { score: 0, mastery: 0, avgTime: 0, trend: 'New' };
    
    const avg = attempted.reduce((acc, q) => acc + (q.correctCount / q.attempts), 0) / attempted.length;
    const totalTime = attempted.reduce((acc, q) => acc + (q.totalSecondsTaken || 0), 0);
    const totalAttempts = attempted.reduce((acc, q) => acc + (q.attempts || 0), 0);
    
    const scoreVal = Math.round(avg * 100);
    return {
      score: scoreVal,
      mastery: Math.round((questions.filter(q => q.srsBox >= 4).length / (questions.length || 1)) * 100),
      avgTime: (totalTime / (totalAttempts || 1)).toFixed(1),
      trend: scoreVal > 80 ? 'Mastery' : scoreVal > 50 ? 'Steady' : 'Action Required'
    };
  }, [questions]);

  const filteredSubjects = useMemo(() => {
    return subjects.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [subjects, searchTerm]);

  if (authError) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <WarningCircleIcon size={32} className="text-destructive mb-4" />
      <h3 className="text-lg font-bold text-foreground mb-2">Authentication Error</h3>
      <p className="text-muted-foreground text-sm max-w-xs">
        {authError.includes('configuration-not-found') 
          ? "Anonymous Authentication is not enabled in your Firebase Console. Please enable it under Build > Authentication > Sign-in method."
          : authError}
      </p>
      <button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 bg-primary text-primary-foreground rounded-full text-sm font-bold shadow-lg shadow-primary/20 transition-all active:scale-95">
        Retry Syncing
      </button>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
      <CircleNotchIcon className="animate-spin text-primary" size={32} />
      <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">Syncing Library</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <div className="max-w-md mx-auto min-h-screen flex flex-col bg-card/30 shadow-[0_0_100px_-30px_rgba(0,0,0,0.1)] relative overflow-hidden ring-1 ring-border/5">
        
        {/* Header */}
        <header className="p-4 bg-background/60 backdrop-blur-xl border-b border-border/5 sticky top-0 z-50">
          <div className="flex justify-between items-center h-12">
            <div className="flex items-center gap-3">
              {view !== 'dashboard' && (
                <button 
                  onClick={() => setView('dashboard')} 
                  className="p-2 hover:bg-secondary active:scale-90 rounded-full transition-all"
                >
                  <ArrowLeftIcon size={20} className="text-muted-foreground" />
                </button>
              )}
              <div>
                <h1 className="text-[17px] font-bold tracking-tight truncate max-w-[180px]">
                  {view === 'dashboard' ? 'test-Pal Sync' : subjects.find(s => s.id === activeSubjectId)?.name || 'Course'}
                </h1>
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isSaving ? "bg-warning" : "bg-success")} />
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                    {isSaving ? 'Syncing...' : 'Encrypted & Secure'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {view === 'dashboard' && (
                <button 
                  onClick={() => setShowPromptModal(true)}
                  className="p-2.5 bg-secondary hover:bg-secondary/80 text-primary rounded-xl border border-border transition-all active:scale-95 shadow-sm"
                  title="AI Prompt Generator"
                >
                  <TerminalWindowIcon size={18} />
                </button>
              )}
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-primary/20">
                {user.email ? user.email[0].toUpperCase() : 'U'}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scroll-smooth">
          {view === 'dashboard' ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
              <div className="px-6 pt-6 pb-4">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar">
                  <div className="bg-secondary/40 backdrop-blur-sm px-4 py-2 rounded-xl flex items-center gap-2 whitespace-nowrap shadow-sm">
                    <StackIcon size={14} className="text-primary" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">{subjects.length} Subjects</span>
                  </div>
                  <div className="bg-success/10 backdrop-blur-sm px-4 py-2 rounded-xl flex items-center gap-2 whitespace-nowrap shadow-sm">
                    <ActivityIcon size={14} className="text-success" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-success">Real-time Sync</span>
                  </div>
                </div>
              </div>

              <div className="px-4 space-y-1">
                <div className="px-2 pt-4 pb-2">
                  <div className="relative group">
                    <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={16} />
                    <input 
                      type="text"
                      placeholder="Search your library..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-secondary/30 border border-border rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:bg-background focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>

                <div className="py-2">
                  {filteredSubjects.length === 0 ? (
                    <div className="text-center py-20 animate-in fade-in duration-1000">
                      <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                        <BookOpenIcon size={24} className="text-muted-foreground/40" />
                      </div>
                      <p className="text-muted-foreground text-xs font-medium italic">
                        {subjects.length === 0 ? "Upload JSON to begin." : "No matches found."}
                      </p>
                    </div>
                  ) : (
                    filteredSubjects.map((subject, idx) => {
                      const mastery = Math.round((subject.questions?.filter(q => q.srsBox >= 4).length / (subject.questions?.length || 1)) * 100);
                      const dueCount = subject.questions?.filter(q => (q.nextReview || 0) <= Date.now()).length || 0;

                      return (
                        <div 
                          key={subject.id} 
                          onClick={() => selectSubject(subject)}
                          style={{ animationDelay: `${idx * 50}ms` }}
                          className="animate-in fade-in slide-in-from-bottom-2 flex items-center gap-4 p-4 hover:bg-secondary/80 rounded-[1.5rem] transition-all cursor-pointer active:scale-[0.98] group relative overflow-hidden mb-3 bg-secondary/20 shadow-sm hover:shadow-md"
                        >
                          <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500",
                            dueCount > 0 ? "bg-warning/10 shadow-lg shadow-warning/5" : "bg-card shadow-sm group-hover:bg-primary/5"
                          )}>
                            {dueCount > 0 ? (
                              <div className="relative">
                                <ClockIcon size={26} className="text-warning animate-pulse" />
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive border-2 border-background rounded-full" />
                              </div>
                            ) : <GraduationCapIcon size={26} className={cn("transition-colors", mastery > 80 ? "text-success" : "text-primary")} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[15px] font-bold text-foreground truncate group-hover:text-primary transition-colors">{subject.name}</h4>
                            <div className="flex items-center gap-3 mt-1.5">
                              <div className="flex-1 bg-secondary h-1.5 rounded-full overflow-hidden border border-border/50">
                                <div 
                                  className={cn("h-full transition-all duration-1000", mastery > 80 ? "bg-success" : "bg-primary")} 
                                  style={{ width: `${mastery}%` }}
                                ></div>
                              </div>
                              <span className="text-[10px] font-black text-muted-foreground/80 shrink-0 tabular-nums">{mastery}%</span>
                            </div>
                            {dueCount > 0 && <p className="text-[10px] font-bold text-warning uppercase mt-1 tracking-widest">{dueCount} review items ready</p>}
                          </div>
                          <button onClick={(e) => deleteSubject(e, subject.id)} className="p-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all active:scale-90">
                            <TrashIcon size={18} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="px-2 pt-6">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="group w-full py-8 bg-secondary/15 hover:bg-secondary/30 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 transition-all active:scale-[0.97] border-2 border-dashed border-border/10"
                  >
                    <div className="w-12 h-12 bg-background rounded-full shadow-sm flex items-center justify-center group-hover:text-primary transition-colors">
                      <PlusIcon size={20} />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest">Add Course Subject</span>
                    <p className="text-[10px] text-muted-foreground font-medium">Supports Flashcard JSON format</p>
                    <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileUpload} />
                  </button>
                </div>
              </div>
            </div>
          ) : view === 'quiz' ? (
            <div className="p-6 animate-in slide-in-from-right duration-300 h-full flex flex-col relative">
              <div className="mb-8">
                <div className="flex justify-between items-end mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Question Timer</span>
                    {quizTimer <= 5 && <WarningCircleIcon size={12} className="text-destructive animate-pulse" />}
                  </div>
                  <span className={cn(
                    "text-xs font-bold tabular-nums",
                    quizTimer <= 5 ? 'text-destructive' : 'text-primary'
                  )}>
                    {quizTimer}s
                  </span>
                </div>
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden border border-border">
                  <div 
                    className={cn(
                      "h-full transition-all duration-1000",
                      quizTimer <= 5 ? 'bg-destructive' : 'bg-primary'
                    )} 
                    style={{ width: `${(quizTimer / QUESTION_TIMEOUT) * 100}%` }}
                  ></div>
                </div>
              </div>

              {currentQ ? (
                <div className="space-y-6 pb-20">
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <span className="px-2.5 py-1 bg-secondary text-[10px] font-bold text-muted-foreground rounded-lg uppercase tracking-wider">UNIT {currentQ.unit || 'A'}</span>
                      <span className="px-2.5 py-1 bg-primary/10 text-[10px] font-bold text-primary rounded-lg uppercase tracking-wider">Box {currentQ.srsBox || 0}</span>
                    </div>
                    <h2 className="text-[19px] font-medium leading-relaxed text-foreground">
                      {currentQ.q}
                    </h2>
                  </div>

                  <div className="space-y-3">
                    {currentQ.options && currentQ.options.map((opt, i) => {
                      const isCorrect = i === currentQ.correct;
                      const isSelected = selectedOption === i;
                      const hasAnswered = selectedOption !== null;
                      
                      return (
                        <button 
                          key={i} 
                          onClick={() => handleAnswer(i)} 
                          disabled={hasAnswered} 
                          className={cn(
                            "w-full text-left p-4 rounded-xl border transition-all duration-200 text-[15px] flex items-start",
                            !hasAnswered ? "bg-card border-border hover:border-primary/50 active:bg-secondary" :
                            isCorrect ? "bg-success/10 border-success text-success" :
                            isSelected ? "bg-destructive/10 border-destructive text-destructive" :
                            "bg-transparent border-border opacity-40"
                          )}
                        >
                          <span className={cn(
                            "w-6 h-6 shrink-0 flex items-center justify-center rounded-md font-bold mr-3 text-xs",
                            hasAnswered && isCorrect ? 'bg-success text-success-foreground' : 'bg-secondary text-muted-foreground'
                          )}>
                            {String.fromCharCode(65+i)}
                          </span>
                          <span className="leading-snug">{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {showExplanation && (
                    <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-4">
                      <div className="flex items-center gap-3 bg-card border border-border p-4 rounded-2xl">
                        <div className={cn(
                          "p-2 rounded-lg",
                          lastTimeTaken < 5 ? 'bg-success/10 text-success' : 
                          lastTimeTaken < 15 ? 'bg-primary/10 text-primary' : 
                          'bg-warning/10 text-warning'
                        )}>
                          {lastTimeTaken < 10 ? <LightningIcon size={18} /> : <TimerIcon size={18} />}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Efficiency Status</p>
                          <p className="text-sm font-bold text-foreground">
                            {lastTimeTaken < 5 ? 'Confident Mastery' : lastTimeTaken < 15 ? 'Calculated Stable' : 'Delayed Assumption'} 
                            <span className="ml-2 font-normal text-muted-foreground">({lastTimeTaken.toFixed(1)}s)</span>
                          </p>
                        </div>
                      </div>

                      <div className="bg-card p-5 rounded-2xl border border-border">
                        <p className="text-muted-foreground text-sm leading-relaxed mb-4">{currentQ.explanation}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold uppercase tracking-widest bg-secondary px-3 py-1.5 rounded-lg w-fit">
                          <TargetIcon size={12} /> Page {currentQ.page || 'Ref'}
                        </div>
                      </div>
                      <button 
                        onClick={() => pickNextQuestion()} 
                        className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20"
                      >
                        Continue Learning <CaretRightIcon size={18} />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                  <CheckCircleIcon size={32} className="text-primary" />
                  <h3 className="text-lg font-medium text-foreground">All Due Items Cleared</h3>
                  <button onClick={() => setView('dashboard')} className="px-8 py-3 bg-secondary border border-border rounded-full text-sm font-medium text-foreground">Library</button>
                </div>
              )}
            </div>
          ) : view === 'stats' ? (
             <div className="p-6 space-y-6 animate-in fade-in duration-500 pb-20">
               <div className="bg-card p-6 rounded-2xl border border-border">
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Knowledge Efficiency</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-foreground">{forecast.score}%</span>
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">({forecast.trend})</span>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card p-5 rounded-2xl border border-border text-center">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Avg Speed</p>
                    <p className="text-xl font-bold text-foreground flex items-center justify-center gap-2">
                      {forecast.avgTime}s <ActivityIcon size={14} className="text-primary" />
                    </p>
                  </div>
                  <div className="bg-card p-5 rounded-2xl border border-border text-center">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Retention</p>
                    <p className="text-xl font-bold text-foreground">{forecast.mastery}%</p>
                  </div>
               </div>

               <div className="space-y-4">
                 <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Speed vs Mastery Analysis</h3>
                 <div className="bg-card p-5 rounded-xl border border-border space-y-4">
                    <div className="flex items-start gap-3">
                      <LightningIcon size={16} className="text-success mt-1" />
                      <p className="text-xs text-muted-foreground">Response under 5s suggests neural-pathway mastery. You "own" this info.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <LightningSlashIcon size={16} className="text-destructive mt-1" />
                      <p className="text-xs text-muted-foreground">Response over 15s suggests logical reconstruction rather than recall (Assumption Risk).</p>
                    </div>
                 </div>
               </div>
            </div>
          ) : (
            <div className="p-6 h-full flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in">
              {!examActive && !examResult ? (
                <div className="space-y-8 max-w-xs mx-auto">
                  <div className="w-20 h-20 bg-warning/10 rounded-full flex items-center justify-center mx-auto border border-warning/20 shadow-xl shadow-warning/10">
                    <TimerIcon size={36} className="text-warning" />
                  </div>
                  <h2 className="text-xl font-medium text-foreground mb-2 uppercase tracking-tighter">Mock Assessment</h2>
                  <button 
                    onClick={startExam} 
                    className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-full transition-transform active:scale-95 text-sm uppercase tracking-wider shadow-lg shadow-primary/20"
                  >
                    Start Exam
                  </button>
                </div>
              ) : examActive ? (
                <div className="w-full text-left space-y-6 pb-24">
                  <div className="flex justify-between items-center bg-secondary p-4 rounded-xl border border-border">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Q {examCurrentIdx + 1} / {examQuestions.length}</span>
                    <span className="flex items-center text-warning text-sm font-bold tabular-nums">
                      <ClockIcon size={16} className="mr-2" /> {Math.floor(examTimer/60)}:{(examTimer%60).toString().padStart(2,'0')}
                    </span>
                  </div>
                  <h2 className="text-lg font-medium text-foreground leading-relaxed">{examQuestions[examCurrentIdx]?.q}</h2>
                  <div className="space-y-3">
                    {examQuestions[examCurrentIdx]?.options?.map((opt, i) => (
                      <button 
                        key={i} 
                        onClick={() => {const newAns = [...examAnswers]; newAns[examCurrentIdx] = i; setExamAnswers(newAns);}} 
                        className={cn(
                          "w-full text-left p-4 rounded-xl border text-sm font-medium transition-all",
                          examAnswers[examCurrentIdx] === i ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20' : 'bg-card border-border text-foreground'
                        )}
                      >
                        <span className="mr-3 opacity-50 font-bold">{String.fromCharCode(65+i)}</span>{opt}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3 pt-8">
                    <button 
                      onClick={() => setExamCurrentIdx(Math.max(0, examCurrentIdx-1))} 
                      disabled={examCurrentIdx===0} 
                      className="flex-1 py-4 bg-secondary rounded-xl font-bold text-[11px] uppercase tracking-widest disabled:opacity-20 border border-border"
                    >
                      Prev
                    </button>
                    {examCurrentIdx === examQuestions.length - 1 ? 
                      <button onClick={finishExam} className="flex-1 py-4 bg-success text-success-foreground rounded-xl font-bold text-[11px] uppercase tracking-widest">Finish</button> :
                      <button onClick={() => setExamCurrentIdx(examCurrentIdx+1)} className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold text-[11px] uppercase tracking-widest">Next</button>
                    }
                  </div>
                </div>
              ) : (
                <div className="space-y-10 py-10">
                  <h2 className="text-5xl font-bold text-foreground tracking-tight">{examResult}%</h2>
                  <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[10px]">Assessment Outcome</p>
                  <button onClick={() => {setExamResult(null); setView('quiz');}} className="w-full py-4 bg-secondary rounded-full font-bold uppercase text-[11px] tracking-widest border border-border">Return to Library</button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* AI Prompt Modal */}
        {showPromptModal && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-10 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-card w-full max-w-sm rounded-[2rem] border border-border shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-500">
              <div className="p-6 border-b border-border flex justify-between items-center bg-secondary/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <TerminalWindowIcon size={18} className="text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">AI Data Generator</h3>
                </div>
                <button onClick={() => setShowPromptModal(false)} className="p-2 hover:bg-secondary rounded-full text-muted-foreground">
                  <XIcon size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-secondary/50 border border-border p-4 rounded-xl flex items-start gap-3">
                  <InfoIcon size={16} className="text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Copy this prompt and paste it into Gemini or ChatGPT with your course PDF to generate compatible subjects.
                  </p>
                </div>
                <div className="relative bg-secondary/30 border border-border rounded-xl p-4 overflow-hidden group">
                  <pre className="text-[11px] text-muted-foreground leading-relaxed font-mono overflow-y-auto max-h-[220px] whitespace-pre-wrap pr-2">
                    {generatorPrompt}
                  </pre>
                </div>
                <button 
                  onClick={handleCopyPrompt}
                  className={cn(
                    "w-full py-4 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                    copyFeedback ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-95'
                  )}
                >
                  {copyFeedback ? <CheckCircleIcon size={16} /> : <CopyIcon size={16} />}
                  {copyFeedback ? 'Prompt Copied!' : 'Copy AI Prompt'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Navigation */}
        {view !== 'dashboard' && !examActive && (
          <nav className="flex items-center justify-around h-20 px-4 bg-card/80 backdrop-blur-md border-t border-border sticky bottom-0 z-50 shadow-2xl">
             <button onClick={() => setView('quiz')} className={cn(
               "flex-1 flex flex-col items-center gap-1.5 transition-all group",
               view === 'quiz' ? 'text-primary' : 'text-muted-foreground'
             )}>
               <div className={cn(
                 "p-2 px-6 rounded-2xl transition-all duration-300 active:scale-95 group-hover:bg-primary/5",
                 view === 'quiz' ? 'bg-primary/10 shadow-lg shadow-primary/5' : 'bg-transparent'
               )}>
                 <BrainIcon size={24} weight={view === 'quiz' ? 'fill' : 'regular'} />
               </div>
               <span className="text-[10px] font-black uppercase tracking-[0.15em]">Learn</span>
             </button>
             <button onClick={() => setView('exam')} className={cn(
               "flex-1 flex flex-col items-center gap-1.5 transition-all group",
               view === 'exam' ? 'text-warning' : 'text-muted-foreground'
             )}>
               <div className={cn(
                 "p-2 px-6 rounded-2xl transition-all duration-300 active:scale-95 group-hover:bg-warning/5",
                 view === 'exam' ? 'bg-warning/10 shadow-lg shadow-warning/5' : 'bg-transparent'
               )}>
                 <TimerIcon size={24} weight={view === 'exam' ? 'fill' : 'regular'} />
               </div>
               <span className="text-[10px] font-black uppercase tracking-[0.15em]">Test</span>
             </button>
             <button onClick={() => setView('stats')} className={cn(
               "flex-1 flex flex-col items-center gap-1.5 transition-all group",
               view === 'stats' ? 'text-success' : 'text-muted-foreground'
             )}>
               <div className={cn(
                 "p-2 px-6 rounded-2xl transition-all duration-300 active:scale-95 group-hover:bg-success/5",
                 view === 'stats' ? 'bg-success/10 shadow-lg shadow-success/5' : 'bg-transparent'
               )}>
                 <ChartBarIcon size={24} weight={view === 'stats' ? 'fill' : 'regular'} />
               </div>
               <span className="text-[10px] font-black uppercase tracking-[0.15em]">Metrics</span>
             </button>
          </nav>
        )}
      </div>
    </div>
  );
};

export default App;
