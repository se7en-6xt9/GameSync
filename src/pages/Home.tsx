import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { GamepadIcon, Users, Cpu, Globe } from 'lucide-react';
import { cn } from '../components/Navbar';
import { useState, useEffect } from 'react';

const GAME_MODES = [
  {
    id: 'local',
    title: 'Player vs Player',
    description: 'Play locally on the same screen.',
    icon: Users,
    color: 'from-blue-500/20 to-purple-500/20',
    border: 'border-blue-400/30'
  },
  {
    id: 'online',
    title: 'Online Multiplayer',
    description: 'Play with someone across the internet.',
    icon: Globe,
    color: 'from-fuchsia-500/20 to-purple-500/20',
    border: 'border-fuchsia-400/30'
  },
  {
    id: 'computer',
    title: 'Player vs Computer',
    description: 'Test your skills against AI.',
    icon: Cpu,
    color: 'from-teal-500/20 to-purple-500/20',
    border: 'border-teal-400/30'
  }
];

export default function Home() {
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    if (window !== window.top) {
      const referrer = document.referrer;
      const parentEnv = import.meta.env.VITE_PARENT_ORIGIN || 'melodysync';
      
      if (referrer && referrer.includes(parentEnv.replace('https://', ''))) {
        setIsEmbedded(true);
      }
    }
  }, []);

  const startMatch = (modeId: string) => {
    navigate(`/game/${modeId}`);
  };

  return (
    <div className={cn(
      "px-4 max-w-6xl mx-auto min-h-screen flex flex-col items-center",
      isEmbedded ? "pt-12 pb-8" : "pt-32 pb-16"
    )}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <h1 className="text-5xl md:text-7xl font-black mb-6 bg-gradient-to-br from-white to-purple-400 bg-clip-text text-transparent">
          Game Zone
        </h1>
        <p className="text-purple-200 text-lg md:text-xl max-w-2xl mx-auto">
          Choose a mode to start playing Tic-Tac-Toe. Everything syncs instantly.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
        {GAME_MODES.map((mode, index) => {
          const isSelected = selectedMode === mode.id;
          return (
            <motion.div
              key={mode.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedMode(mode.id)}
              className={cn(
                "relative flex flex-col p-8 rounded-3xl cursor-pointer overflow-hidden transition-all duration-300",
                "bg-[var(--color-glass-surface)] backdrop-blur-xl border border-[var(--color-glass-border)]",
                isSelected ? "ring-2 ring-purple-400 shadow-[0_0_30px_rgba(157,124,255,0.3)]" : "hover:border-purple-400/50"
              )}
            >
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-50", mode.color)} />
              
              <div className="relative z-10 flex flex-col items-center text-center gap-4">
                <div className={cn("p-4 rounded-2xl bg-black/20 border", mode.border)}>
                  <mode.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold">{mode.title}</h3>
                <p className="text-purple-200 text-sm">
                  {mode.description}
                </p>

                {isSelected && (
                  <motion.button
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      startMatch(mode.id);
                    }}
                    className="mt-4 px-8 py-3 bg-white text-purple-900 rounded-full font-bold shadow-[0_0_20px_rgba(255,255,255,0.4)] hover:shadow-[0_0_30px_rgba(255,255,255,0.6)] focus:outline-none"
                  >
                    Start Game
                  </motion.button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
