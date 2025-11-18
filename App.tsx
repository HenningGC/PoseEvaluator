import React, { useState, useEffect } from 'react';
import { ExerciseType, ExerciseState } from './types';
import PoseCanvas from './components/PoseCanvas';
import { ArrowLeft, Activity, ChevronRight, Trophy } from 'lucide-react';

// Simple Router
enum Screen {
  HOME,
  WORKOUT
}

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.HOME);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseType | null>(null);
  const [workoutState, setWorkoutState] = useState<ExerciseState>({
    count: 0,
    feedback: "Loading...",
    isCorrectForm: true,
    stage: 'NEUTRAL',
    timer: 0
  });

  // Orientation Support
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    
    // Check initially
    checkOrientation();

    // Add listener
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  const startWorkout = (type: ExerciseType) => {
    setSelectedExercise(type);
    setWorkoutState({
      count: 0,
      feedback: "Get in position",
      isCorrectForm: true,
      stage: 'NEUTRAL',
      timer: 0
    });
    setCurrentScreen(Screen.WORKOUT);
  };

  const handleUpdate = (newState: ExerciseState) => {
    setWorkoutState(newState);
  };

  const renderInstructions = (type: ExerciseType) => {
    switch(type) {
        case ExerciseType.PUSHUP: return "Keep your back straight. Lower your chest until elbows are at 90 degrees.";
        case ExerciseType.SQUAT: return "Feet shoulder-width apart. Keep chest up. Lower hips until thighs are parallel.";
        case ExerciseType.PLANK: return "Forearms on ground. Body in a straight line from head to heels. Hold.";
        default: return "";
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 text-white flex flex-col">
      
      {/* Header */}
      <header className="p-4 md:p-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        {currentScreen === Screen.WORKOUT ? (
          <button 
            onClick={() => setCurrentScreen(Screen.HOME)}
            className="p-2 rounded-full hover:bg-slate-800 transition text-slate-300 hover:text-white flex items-center gap-2"
          >
            <ArrowLeft size={24} />
            {isLandscape && <span className="font-semibold">Back</span>}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-cyan-400">
             <Activity size={28} />
             <h1 className="text-xl font-bold tracking-tight text-white">PoseMaster AI</h1>
          </div>
        )}
        
        {currentScreen === Screen.WORKOUT && (
          <div className="flex items-center gap-4">
             <div className="text-sm text-slate-400 font-medium hidden md:block">
                {selectedExercise === ExerciseType.PLANK ? 'TIMER' : 'REPS'}
             </div>
             <div className="text-3xl font-bold font-mono text-cyan-400">
                {selectedExercise === ExerciseType.PLANK 
                  ? Math.floor(workoutState.timer || 0) + 's'
                  : workoutState.count}
             </div>
          </div>
        )}
      </header>

      {/* Main Content - Responsive Container */}
      <main className={`flex-1 flex flex-col mx-auto w-full p-4 gap-6 transition-all duration-300 ${isLandscape && currentScreen === Screen.WORKOUT ? 'max-w-6xl' : 'max-w-md'}`}>
        
        {currentScreen === Screen.HOME && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="py-8 text-center">
              <h2 className="text-3xl font-bold mb-2">Choose Workout</h2>
              <p className="text-slate-400">Select an exercise to start tracking your form and reps.</p>
            </div>

            <div className="grid gap-4">
              <ExerciseCard 
                title="Pushups" 
                description="Chest & Triceps"
                icon="💪" 
                color="from-blue-500 to-cyan-500"
                onClick={() => startWorkout(ExerciseType.PUSHUP)}
              />
              <ExerciseCard 
                title="Plank" 
                description="Core Stability"
                icon="⏱️" 
                color="from-indigo-500 to-purple-500"
                onClick={() => startWorkout(ExerciseType.PLANK)}
              />
              <ExerciseCard 
                title="Squats" 
                description="Legs & Glutes"
                icon="🦵" 
                color="from-orange-500 to-red-500"
                onClick={() => startWorkout(ExerciseType.SQUAT)}
              />
            </div>

            <div className="mt-8 bg-slate-900 p-6 rounded-2xl border border-slate-800">
               <div className="flex items-center gap-4 mb-4">
                  <Trophy className="text-yellow-500" />
                  <h3 className="font-bold">Daily Goals</h3>
               </div>
               <div className="space-y-4">
                  <GoalRow label="Pushups" current={12} target={50} />
                  <GoalRow label="Squats" current={45} target={100} />
               </div>
            </div>
          </div>
        )}

        {currentScreen === Screen.WORKOUT && selectedExercise && (
           <div className={`flex gap-4 h-full animate-in zoom-in duration-300 ${isLandscape ? 'flex-row' : 'flex-col'}`}>
              
              {/* Left Panel: Feedback & Instructions */}
              <div className={`flex flex-col gap-4 ${isLandscape ? 'w-1/3 min-w-[250px]' : 'w-full'}`}>
                  {/* Feedback Bar */}
                  <div className={`
                    p-4 rounded-2xl text-center font-bold text-lg transition-colors duration-300 shadow-lg flex items-center justify-center min-h-[80px]
                    ${workoutState.isCorrectForm ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}
                  `}>
                    {workoutState.feedback}
                  </div>

                  {/* Extended Info Panel for Landscape */}
                  {isLandscape && (
                    <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 text-slate-400 flex-1 flex flex-col">
                       <h4 className="text-white font-semibold mb-4 text-lg">Instructions</h4>
                       <p className="text-sm leading-relaxed mb-6">{renderInstructions(selectedExercise)}</p>
                       
                       <div className="mt-auto pt-6 border-t border-slate-800">
                          <div className="text-xs uppercase text-slate-500 font-semibold tracking-wider mb-2">
                              Current Session
                          </div>
                          <div className="flex items-end gap-2">
                             <span className="text-4xl font-mono font-bold text-white">
                                {selectedExercise === ExerciseType.PLANK 
                                  ? (workoutState.timer || 0).toFixed(1)
                                  : workoutState.count}
                             </span>
                             <span className="text-lg text-cyan-400 mb-1">
                                {selectedExercise === ExerciseType.PLANK ? 's' : 'reps'}
                             </span>
                          </div>
                       </div>
                    </div>
                  )}
              </div>

              {/* Camera View - Resizes based on container */}
              <div className={`relative rounded-3xl overflow-hidden shadow-2xl border border-slate-800 bg-black transition-all duration-500 ${isLandscape ? 'flex-1 aspect-video self-stretch' : 'aspect-[3/4] w-full'}`}>
                  <PoseCanvas 
                    exerciseType={selectedExercise} 
                    onUpdate={handleUpdate} 
                  />
              </div>

              {/* Mobile/Portrait Instructions */}
              {!isLandscape && (
                <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 text-sm text-slate-400">
                   <h4 className="text-white font-semibold mb-2">Instructions</h4>
                   <p>{renderInstructions(selectedExercise)}</p>
                </div>
              )}
           </div>
        )}

      </main>
    </div>
  );
};

// Subcomponents
const ExerciseCard: React.FC<{
  title: string;
  description: string;
  icon: string;
  color: string;
  onClick: () => void;
}> = ({ title, description, icon, color, onClick }) => (
  <button 
    onClick={onClick}
    className="group relative overflow-hidden rounded-2xl p-6 text-left transition-all hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-cyan-400"
  >
    <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-10 group-hover:opacity-20 transition-opacity`}></div>
    <div className="relative z-10 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-2xl shadow-lg`}>
          {icon}
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <p className="text-sm text-slate-400">{description}</p>
        </div>
      </div>
      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
         <ChevronRight className="text-slate-300 group-hover:text-white" />
      </div>
    </div>
  </button>
);

const GoalRow: React.FC<{label: string, current: number, target: number}> = ({ label, current, target }) => (
  <div>
    <div className="flex justify-between text-xs mb-1">
      <span className="text-slate-300">{label}</span>
      <span className="text-slate-500">{current} / {target}</span>
    </div>
    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
      <div 
        className="h-full bg-cyan-500 rounded-full" 
        style={{ width: `${Math.min(100, (current / target) * 100)}%` }}
      ></div>
    </div>
  </div>
);

export default App;