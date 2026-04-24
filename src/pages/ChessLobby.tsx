import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { Users, Cpu, Globe } from 'lucide-react';
import { cn } from '../components/Navbar';

const GAME_MODES = [
  {
    id: 'local',
    title: 'Local Match',
    description: 'Play locally on the same screen.',
    icon: Users,
    color: 'from-blue-500/20 to-purple-500/20',
    border: 'border-blue-400/30'
  },
  {
    id: 'online',
    title: 'Online Match',
    description: 'Play with a friend across the internet.',
    icon: Globe,
    color: 'from-fuchsia-500/20 to-purple-500/20',
    border: 'border-fuchsia-400/30'
  },
  {
    id: 'computer',
    title: 'Vs Computer',
    description: 'Test your skills against AI with multiple difficulties.',
    icon: Cpu,
    color: 'from-teal-500/20 to-purple-500/20',
    border: 'border-teal-400/30'
  }
];

export default function ChessLobby() {
  const navigate = useNavigate();
  const { username, setNamePopupOpen } = useUserStore();
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const joinWithCode = () => {
    if (!username.trim()) {
      setNamePopupOpen(true);
      return;
    }
    if (joinCode.length === 4) {
       navigate(`/chessgame/online?roomId=${joinCode}`);
    }
  };

  useEffect(() => {
    if (window !== window.top) {
      const referrer = document.referrer;
      const parentEnv = import.meta.env.VITE_PARENT_ORIGIN || 'melodysync';
      if (referrer && referrer.includes(parentEnv.replace('https://', ''))) {
        setIsEmbedded(true);
      }
    }
  }, []);

  const startMatch = async (modeId: string) => {
    if (!username.trim()) {
      setNamePopupOpen(true);
      return;
    }
    
    const oldGameId = useUserStore.getState().activeGameId;
    useUserStore.getState().setActiveGameId(null);
    navigate(`/chessgame/${modeId}?clearOld=true`);
  };

  return (
    <div className={cn(
      "px-4 max-w-6xl mx-auto min-h-screen flex flex-col items-center",
      isEmbedded ? "pt-12 pb-8" : "pt-32 pb-16"
    )}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="text-center mb-16"
      >
        <h1 className="text-5xl md:text-7xl font-black mb-6 bg-gradient-to-br from-white to-blue-400 bg-clip-text text-transparent">
          Chess
        </h1>
        <p className="text-blue-200 text-lg md:text-xl max-w-2xl mx-auto">
          Choose a mode to start playing.
        </p>
      </motion.div>

      {/* Join Section */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 w-full max-w-xl bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl flex flex-col sm:flex-row gap-4 items-center"
      >
        <div className="flex-1">
          <h3 className="text-white font-bold mb-1">Join Chess Room</h3>
          <p className="text-white/40 text-xs">Enter a 4-digit code to join a friend.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <input 
            type="text"
            maxLength={4}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))}
            placeholder="Room Code"
            className="w-full sm:w-32 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <button 
            disabled={joinCode.length !== 4}
            onClick={joinWithCode}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-all transition-all"
          >
            Join
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
        {GAME_MODES.map((mode, index) => {
          const isSelected = selectedMode === mode.id;
          return (
            <motion.div
              key={mode.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, type: "spring", stiffness: 400, damping: 25 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedMode(mode.id)}
              className={cn(
                "relative flex flex-col p-8 rounded-3xl cursor-pointer overflow-hidden transition-all duration-300",
                "bg-[var(--color-glass-surface)] backdrop-blur-xl border border-[var(--color-glass-border)]",
                isSelected ? "ring-2 ring-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.3)]" : "hover:border-blue-400/50"
              )}
            >
              <div className={cn("absolute inset-0 bg-gradient-to-br opacity-50", mode.color)} />
              
              <div className="relative z-10 flex flex-col items-center text-center gap-4">
                <div className={cn("p-4 rounded-2xl bg-black/20 border", mode.border)}>
                  <mode.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold">{mode.title}</h3>
                <p className="text-blue-200 text-sm">
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
                    className="mt-4 px-8 py-3 bg-white text-blue-900 rounded-full font-bold shadow-[0_0_20px_rgba(255,255,255,0.4)] hover:shadow-[0_0_30px_rgba(255,255,255,0.6)] focus:outline-none"
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
