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
  XIcon,
  TrendUpIcon,
  GearIcon,
  TerminalWindowIcon,
  PlusIcon,
  TrashIcon,
  ArrowLeftIcon,
  GraduationCapIcon,
  MagnifyingGlassIcon,
  StackIcon,
  ActivityIcon,
  TimerIcon,
  CircleNotchIcon,
  CopyIcon,
  LightningSlashIcon,
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
  lastActivityDate?: number;
  feedback?: string; // New field for feedback
}

interface Subject {
  id: string;
  name: string;
  questions: Question[];
  streak: number;
  lastActivityDate?: number;
  createdAt: number;
  config?: StudyConfig;
}

interface StudyConfig {
  focusUnit: string; // 'all' or specific unit name
  isRandomized: boolean;
  dailyGoal?: number;
}

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [view, setView] = useState('dashboard'); // 'dashboard', 'quiz', 'stats', 'exam'
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [configSubjectId, setConfigSubjectId] = useState<string | null>(null);
  const [studyConfig, setStudyConfig] = useState<StudyConfig>({ focusUnit: 'all', isRandomized: true, dailyGoal: 10 });
  const [copyFeedback, setCopyFeedback] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theme Awareness
  useEffect(() => {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const listener = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  // Active Subject State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null); // New feedback state

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

    // Load per-subject config or use default
    if (subject.config) {
      setStudyConfig(subject.config);
    } else {
      setStudyConfig({ focusUnit: 'all', isRandomized: true, dailyGoal: 10 });
    }

    setView('quiz');
    pickNextQuestion(qs);
  };

  const saveSubjectConfig = async (subjectId: string, newConfig: StudyConfig) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'subjects', subjectId), {
        config: newConfig,
        lastUpdated: Date.now()
      }, { merge: true });
      if (activeSubjectId === subjectId) {
        setStudyConfig(newConfig);
      }
    } catch (err) { console.error(err); }
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


  const pickNextQuestion = (allQuestions = questions) => {
    if (!allQuestions || allQuestions.length === 0) {
      setCurrentQuestionIndex(null);
      return;
    }

    // Filter by unit if configured
    let pool = allQuestions;
    if (studyConfig.focusUnit !== 'all') {
      pool = allQuestions.filter(q => q.unit === studyConfig.focusUnit);
    }

    // Filter by due date
    const duePool = pool.filter(q => q.nextReview <= Date.now());
    
    if (duePool.length > 0) {
      // If randomized, pick a random one from the due pool
      if (studyConfig.isRandomized) {
        const randomIndex = Math.floor(Math.random() * duePool.length);
        const questionInMainList = allQuestions.findIndex(q => q.num === duePool[randomIndex].num);
        setCurrentQuestionIndex(questionInMainList);
      } else {
        // If not randomized, pick the first one from the due pool
        const firstDue = duePool[0];
        const questionInMainList = allQuestions.findIndex(q => q.num === firstDue.num);
        setCurrentQuestionIndex(questionInMainList);
      }
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
    
    // Feedback Logic
    if (isCorrect) {
      const messages = ["Great job!", "Excellent!", "You're on fire!", "Keep it up!", "Spot on!", "Brilliant!"];
      setFeedback(messages[Math.floor(Math.random() * messages.length)]);
      setTimeout(() => setFeedback(null), 2000);
    }

    const updatedQuestions = [...questions];
    const q = updatedQuestions[currentQuestionIndex];
    q.attempts = (q.attempts || 0) + 1;
    q.totalSecondsTaken = (q.totalSecondsTaken || 0) + elapsed;
    q.lastActivityDate = Date.now();

    if (isCorrect) {
      q.srsBox = Math.min((q.srsBox || 0) + 1, REVIEW_INTERVALS.length - 1);
      q.correctCount = (q.correctCount || 0) + 1;
    } else {
      q.srsBox = 0;
    }
    
    q.nextReview = Date.now() + (REVIEW_INTERVALS[q.srsBox] * 60000);
    setQuestions(updatedQuestions);
    setShowExplanation(true);

    // Update Streak & Activity
    if (activeSubjectId) {
      const subject = subjects.find(s => s.id === activeSubjectId);
      if (subject) {
        const lastActivity = subject.lastActivityDate ? new Date(subject.lastActivityDate) : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let newStreak = subject.streak || 0;
        
        if (!lastActivity) {
          newStreak = 1;
        } else {
          lastActivity.setHours(0, 0, 0, 0);
          const diffInTime = today.getTime() - lastActivity.getTime();
          const diffInDays = Math.round(diffInTime / (1000 * 3600 * 24));
          
          if (diffInDays === 1) {
            newStreak += 1;
          } else if (diffInDays > 1) {
            newStreak = 1;
          }
        }
        
        setDoc(doc(db, 'artifacts', appId, 'subjects', activeSubjectId), {
          questions: updatedQuestions,
          streak: newStreak,
          lastActivityDate: Date.now(),
          lastUpdated: Date.now()
        }, { merge: true });
      }
    }
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

  // Derived States
  const sortedSubjects = useMemo(() => {
    return [...subjects].sort((a,b) => b.createdAt - a.createdAt);
  }, [subjects]);

  const filteredSubjects = useMemo(() => {
    return sortedSubjects.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [sortedSubjects, searchTerm]);

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

  const unitStats = useMemo(() => {
    const stats: Record<string, {
      unit: string;
      total: number;
      attempted: number;
      correct: number;
      totalTime: number;
      masteryCount: number;
      dueCount: number;
    }> = {};

    questions.forEach(q => {
      const u = q.unit || 'Unknown';
      if (!stats[u]) {
        stats[u] = { unit: u, total: 0, attempted: 0, correct: 0, totalTime: 0, masteryCount: 0, dueCount: 0 };
      }
      stats[u].total += 1;
      if (q.attempts > 0) {
        stats[u].attempted += 1;
        stats[u].correct += q.correctCount;
        stats[u].totalTime += q.totalSecondsTaken || 0;
      }
      if (q.srsBox >= 4) stats[u].masteryCount += 1;
      if (q.nextReview <= Date.now()) stats[u].dueCount += 1;
    });

    return Object.values(stats).map(s => ({
      ...s,
      score: s.attempted > 0 ? Math.round((s.correct / s.attempted) * 100) : 0,
      mastery: Math.round((s.masteryCount / s.total) * 100),
      avgTime: s.attempted > 0 ? (s.totalTime / s.attempted).toFixed(1) : '0.0'
    })).sort((a, b) => a.score - b.score); // Show weak areas first
  }, [questions]);

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
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30 transition-colors duration-300">
      <div className="min-h-screen flex flex-col relative overflow-hidden">
        
        {/* Header */}
        <header className="px-4 py-4 md:px-6 md:py-6 bg-background sticky top-0 z-50 transition-all duration-300">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-3">
              {view !== 'dashboard' && (
                <button 
                  onClick={() => setView('dashboard')} 
                  className="p-3 bg-secondary/40 dark:bg-muted/30 hover:bg-secondary active:scale-90 rounded-full transition-all"
                >
                  <ArrowLeftIcon size={20} className="text-muted-foreground" />
                </button>
              )}
              <div>
                <h1 className="text-[16px] md:text-[18px] font-black tracking-tight truncate max-w-[150px] md:max-w-[180px]">
                  {view === 'dashboard' ? 'test-Pal Sync' : subjects.find(s => s.id === activeSubjectId)?.name || 'Course'}
                </h1>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full animate-pulse bg-primary" />
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">
                    Encrypted Library
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
                  {view === 'dashboard' && (
                <button 
                  onClick={() => setShowPromptModal(true)}
                  className="p-3 bg-secondary dark:bg-card hover:bg-secondary/80 text-primary rounded-[1.25rem] transition-all active:scale-95 shadow-lg"
                  title="AI Prompt Generator"
                >
                  <TerminalWindowIcon size={18} />
                </button>
              )}
              <div className="w-10 h-10 md:w-11 md:h-11 bg-primary rounded-full flex items-center justify-center text-xs font-black text-primary-foreground shadow-2xl shadow-primary/10">
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

              <div className="px-4 space-y-2">
                <div className="px-2 pt-2 pb-6">
                  <div className="relative group">
                    <div className="absolute inset-0 bg-secondary/40 dark:bg-muted rounded-full pointer-events-none" />
                    <MagnifyingGlassIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
                    <input 
                      type="text"
                      placeholder="Search for subjects & library..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-transparent border-none rounded-full py-3.5 md:py-5 pl-12 md:pl-14 pr-6 text-[15px] md:text-[16px] font-black focus:ring-0 transition-all placeholder:text-muted-foreground/30 relative z-10"
                    />
                  </div>
                </div>

                <div className="py-2 space-y-3">
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
                    filteredSubjects.map((subject: Subject, idx: number) => {
                      const mastery = subject.questions.length > 0 ? Math.round((subject.questions.filter(q => q.srsBox > 0).length / subject.questions.length) * 100) : 0;
                      const dueCount = subject.questions.filter(q => q.nextReview < Date.now()).length || 0;

                      return (
                        <div 
                          key={subject.id} 
                          onClick={() => selectSubject(subject)}
                          style={{ animationDelay: `${idx * 50}ms` }}
                          className="animate-in fade-in slide-in-from-bottom-2 flex items-center gap-3 md:gap-4 p-3 md:p-4 bg-secondary/30 dark:bg-card hover:bg-secondary/50 dark:hover:bg-accent/40 rounded-xl md:rounded-2xl transition-all cursor-pointer active:scale-[0.98] group relative shadow-md hover:shadow-xl mb-3 md:mb-4 border border-border/50"
                        >
                          <div className={cn(
                            "w-12 h-12 md:w-14 md:h-14 rounded-lg md:rounded-xl flex items-center justify-center shrink-0 transition-all duration-500 shadow-inner",
                            dueCount > 0 ? "bg-warning/20" : "bg-background/80 dark:bg-muted"
                          )}>
                            {dueCount > 0 ? (
                              <div className="relative">
                                <ClockIcon size={20} className="text-warning animate-pulse" />
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-destructive border-4 border-background rounded-full" />
                              </div>
                            ) : <GraduationCapIcon size={20} className={cn("transition-colors", mastery > 80 ? "text-success" : "text-primary")} />}
                          </div>
                          <div className="flex-1 min-w-0 pr-2">
                            <h4 className="text-[14px] md:text-[15px] font-black text-foreground truncate group-hover:text-primary transition-colors tracking-tight uppercase">{subject.name}</h4>
                            <div className="flex items-center gap-2 mt-1.5">
                              <div className="flex-1 bg-background/50 dark:bg-muted h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className={cn("h-full transition-all duration-1000 shadow-sm", mastery > 80 ? "bg-success" : "bg-primary")} 
                                  style={{ width: `${mastery}%` }}
                                ></div>
                              </div>
                              <span className="text-[9px] md:text-[10px] font-black text-muted-foreground/80 shrink-0 tabular-nums uppercase">{mastery}% master</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                              {dueCount > 0 && <p className="text-[9px] font-black text-warning uppercase tracking-[0.1em]">{dueCount} reviews pending</p>}
                              {subject.streak > 0 && (
                                <p className="text-[9px] font-black text-success uppercase tracking-[0.1em] flex items-center gap-1">
                                  <TrendUpIcon size={12} weight="bold" /> {subject.streak} Day Streak
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 items-center">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfigSubjectId(subject.id);
                                setStudyConfig(subject.config || { focusUnit: 'all', isRandomized: true, dailyGoal: 10 });
                                setShowSettingsModal(true);
                              }}
                              className="p-2 opacity-100 md:opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all active:scale-90 bg-background/40 dark:bg-muted/40 rounded-lg border border-border/20"
                            >
                              <GearIcon size={16} />
                            </button>
                            <button onClick={(e) => deleteSubject(e, subject.id)} className="p-2 opacity-100 md:opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all active:scale-90 bg-background/40 dark:bg-muted/40 rounded-lg border border-border/20">
                              <TrashIcon size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="px-2 pt-6">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="group w-full py-6 md:py-8 bg-secondary/15 hover:bg-secondary/30 rounded-[1.5rem] md:rounded-[2.5rem] flex flex-col items-center justify-center gap-3 transition-all active:scale-[0.97] border-2 border-dashed border-border/10"
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
              {/* Session Metrics Bar */}
              <div className="flex items-center justify-between mb-8 animate-in fade-in duration-700">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em]">Daily Goal</span>
                    <span className="text-[10px] font-black text-primary tabular-nums">{questions.filter(q => q.attempts > 0 && new Date(q.lastActivityDate || 0).toDateString() === new Date().toDateString()).length} / {studyConfig.dailyGoal || 10}</span>
                  </div>
                  <div className="w-32 h-1.5 bg-secondary rounded-full overflow-hidden border border-border/20">
                    <div 
                      className="h-full bg-primary transition-all duration-1000" 
                      style={{ width: `${Math.min((questions.filter(q => q.attempts > 0 && new Date(q.lastActivityDate || 0).toDateString() === new Date().toDateString()).length / (studyConfig.dailyGoal || 10)) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em]">Timer</span>
                    <span className={cn("text-xs font-black tabular-nums", quizTimer <= 5 ? 'text-destructive' : 'text-primary')}>
                      {quizTimer}s
                    </span>
                  </div>
                  <div className="bg-success/10 px-3 py-2 rounded-xl border border-success/20 flex items-center gap-2">
                    <TrendUpIcon size={14} className="text-success" />
                    <span className="text-[11px] font-black text-success uppercase">
                      {subjects.find(s => s.id === activeSubjectId)?.streak || 0}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden border border-border/30">
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
                <div className="space-y-6 md:space-y-8 pb-20">
                  <div className="bg-secondary/40 dark:bg-card/60 rounded-[1.5rem] md:rounded-[2.5rem] p-6 md:p-10 shadow-2xl shadow-primary/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -mr-20 -mt-20 blur-3xl opacity-50" />
                    <div className="relative z-10 space-y-4 md:space-y-5">
                      <div className="flex gap-2">
                        <span className="px-3 md:px-4 py-1.5 bg-primary/15 text-[10px] font-black text-primary rounded-full uppercase tracking-widest">UNIT {currentQ.unit || 'A'}</span>
                        <span className="px-3 md:px-4 py-1.5 bg-background/50 dark:bg-muted/40 text-[10px] font-black text-muted-foreground rounded-full uppercase tracking-widest">SRS Box {currentQ.srsBox || 0}</span>
                      </div>
                      <h2 className="text-lg md:text-2xl font-black leading-tight text-foreground tracking-tight">
                        {currentQ.q}
                      </h2>
                    </div>
                    {feedback && (
                      <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm flex items-center justify-center animate-in fade-in zoom-in duration-300 z-20 pointer-events-none">
                        <span className="text-2xl md:text-3xl font-black text-primary drop-shadow-lg">{feedback}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4">
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
                            "w-full text-left p-4 md:p-6 rounded-[1.25rem] md:rounded-[2rem] transition-all duration-300 active:scale-[0.98] flex items-center group relative overflow-hidden shadow-sm",
                            !hasAnswered ? "bg-secondary/25 hover:bg-secondary/40 dark:hover:bg-card/40" :
                            isCorrect ? "bg-success/20 shadow-lg shadow-success/10" :
                            isSelected ? "bg-destructive/20 shadow-lg shadow-destructive/10" :
                            "bg-transparent opacity-40"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 md:w-11 md:h-11 shrink-0 flex items-center justify-center rounded-2xl font-black mr-4 md:mr-5 text-sm transition-all duration-500 shadow-inner",
                            !hasAnswered ? "bg-card dark:bg-background text-muted-foreground group-hover:bg-primary/5 group-hover:text-primary" :
                            isCorrect ? "bg-success text-white scale-110 rotate-3 shadow-xl" : 
                            isSelected ? "bg-destructive text-white scale-110" : "bg-card/50 dark:bg-background/50 text-muted-foreground"
                          )}>
                            {String.fromCharCode(65+i)}
                          </div>
                          <span className={cn(
                            "flex-1 text-[15px] md:text-[16px] font-black leading-relaxed",
                            hasAnswered && isCorrect ? "text-success" : "text-foreground"
                          )}>{opt}</span>
                          {hasAnswered && isCorrect && <CheckCircleIcon size={22} weight="fill" className="text-success animate-in zoom-in-50 duration-500 ml-4" />}
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

                <div className="space-y-4 pt-4">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest ml-1">Unit Mastery Breakdown</h3>
                  <div className="space-y-3">
                    {unitStats.map((stat, idx) => (
                      <div key={idx} className="bg-card p-4 rounded-2xl border border-border flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-[10px]",
                          stat.score > 80 ? "bg-success/10 text-success" : 
                          stat.score > 50 ? "bg-primary/10 text-primary" : 
                          "bg-destructive/10 text-destructive"
                        )}>
                          {stat.score}%
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <h4 className="text-xs font-bold text-foreground truncate uppercase tracking-tight">{stat.unit}</h4>
                            <span className="text-[10px] text-muted-foreground font-medium">{stat.mastery}% Master</span>
                          </div>
                          <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className={cn("h-full transition-all duration-1000", stat.score > 80 ? "bg-success" : stat.score > 50 ? "bg-primary" : "bg-destructive")} 
                              style={{ width: `${stat.score}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center justify-end gap-1.5 mb-0.5">
                            <TimerIcon size={10} className="text-muted-foreground" />
                            <span className="text-[10px] font-bold text-foreground tabular-nums">{stat.avgTime}s</span>
                          </div>
                          {stat.dueCount > 0 && (
                            <span className="text-[9px] font-black text-warning uppercase">Due: {stat.dueCount}</span>
                          )}
                        </div>
                      </div>
                    ))}
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
                  <h3 className="text-sm font-bold text-foreground lowercase tracking-tight">AI Data Generator</h3>
                </div>
                <button onClick={() => setShowPromptModal(false)} className="p-2 hover:bg-secondary rounded-full text-muted-foreground">
                  <XIcon size={20} />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Copy this prompt, then go to an AI tool (like ChatGPT or Claude) and upload your course PDF. It will generate the JSON content for your library.
                </p>
                <div className="bg-secondary/50 p-4 rounded-xl font-mono text-[10px] break-all text-muted-foreground/80 border border-border h-40 overflow-y-auto no-scrollbar">
                  {generatorPrompt}
                </div>
                <button 
                  onClick={handleCopyPrompt}
                  className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-primary/20"
                >
                  {copyFeedback ? <CheckCircleIcon size={18} /> : <CopyIcon size={18} />}
                  {copyFeedback ? 'Prompt Copied' : 'Copy Generator Prompt'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Per-Subject Settings Modal */}
        {showSettingsModal && configSubjectId && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-10 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-card w-full max-w-sm rounded-[2rem] border border-border shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-500">
              <div className="p-6 border-b border-border flex justify-between items-center bg-secondary/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <GearIcon size={18} className="text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground lowercase tracking-tight">
                    {subjects.find(s => s.id === configSubjectId)?.name.substring(0, 15)}... Settings
                  </h3>
                </div>
                <button onClick={() => setShowSettingsModal(false)} className="p-2 hover:bg-secondary rounded-full text-muted-foreground">
                  <XIcon size={20} />
                </button>
              </div>
              
              <div className="p-8 space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 text-primary">Target Topic Focus</label>
                  <div className="bg-secondary/40 rounded-2xl border border-border/50 p-4">
                    <select 
                      value={studyConfig.focusUnit} 
                      onChange={(e) => setStudyConfig(prev => ({ ...prev, focusUnit: e.target.value }))}
                      className="w-full bg-transparent border-none text-sm font-bold text-foreground focus:ring-0 p-0 pr-8"
                    >
                      <option value="all">Global (All Units)</option>
                      {Array.from(new Set(subjects.find(s => s.id === configSubjectId)?.questions.map(q => q.unit))).filter(Boolean).sort().map(u => (
                        <option key={String(u)} value={String(u)}>{String(u)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-secondary/40 rounded-2xl border border-border/50 p-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-primary">Curriculum Shuffle</span>
                    <span className="text-[11px] font-bold text-foreground opacity-60">Randomize question order</span>
                  </div>
                  <button 
                    onClick={() => setStudyConfig(prev => ({ ...prev, isRandomized: !prev.isRandomized }))}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative overflow-hidden",
                      studyConfig.isRandomized ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                      studyConfig.isRandomized ? "right-1" : "left-1"
                    )} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-primary">Daily Mastery Goal</label>
                    <span className="text-xs font-black text-primary tabular-nums">{studyConfig.dailyGoal || 10} q's</span>
                  </div>
                  <div className="flex items-center gap-4 px-2">
                    <input 
                      type="range" 
                      min="5" 
                      max="50" 
                      step="5"
                      value={studyConfig.dailyGoal || 10}
                      onChange={(e) => setStudyConfig(prev => ({ ...prev, dailyGoal: parseInt(e.target.value) }))}
                      className="flex-1 accent-primary h-1.5 bg-secondary rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => {
                    saveSubjectConfig(configSubjectId, studyConfig);
                    setShowSettingsModal(false);
                  }}
                  className="w-full py-5 bg-primary text-primary-foreground rounded-2xl font-bold transition-all active:scale-[0.98] shadow-lg shadow-primary/20 uppercase text-xs tracking-widest"
                >
                  Save Configuration
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
