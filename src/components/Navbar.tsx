import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { Gamepad2, User, KeyRound, X, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const TABS = [
  { name: 'Games', path: '/', icon: Gamepad2 },
  { name: 'Profile', path: '/profile', icon: User },
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const { username, setNamePopupOpen } = useUserStore();

  useEffect(() => {
    if (window !== window.top) {
      const referrer = document.referrer;
      const parentEnv = import.meta.env.VITE_PARENT_ORIGIN || 'melodysync';
      if (referrer && referrer.includes(parentEnv.replace('https://', ''))) {
        setIsEmbedded(true);
      }
    }
  }, []);

  if (isEmbedded) {
    return null;
  }

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
       setShowJoinModal(false);
       setNamePopupOpen(true);
       return;
    }
    const code = joinCode.trim();
    if (code.length !== 4) return;
    
    // Auto Navigate to online handler with Code in searchParams
    navigate(`/game/online?roomId=${code}`);
    setShowJoinModal(false);
    setJoinCode('');
  };

  return (
    <>
      <div className="fixed top-6 left-0 right-0 z-[100] flex justify-center px-4">
        <nav className="flex items-center gap-2 p-2 bg-[var(--color-glass-surface)]/80 backdrop-blur-xl border border-[var(--color-glass-border)] rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)]">
          {TABS.map((tab) => {
            const isActive = location.pathname === tab.path;
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={cn(
                  "relative flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-full transition-colors",
                  isActive ? "text-white" : "text-purple-200 hover:text-white hover:bg-white/5"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-bubble"
                    className="absolute inset-0 bg-purple-500/40 rounded-full border border-purple-400/30"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <tab.icon className="w-4 h-4 relative z-10" />
                <span className="relative z-10">{tab.name}</span>
              </NavLink>
            );
          })}
          
          <div className="w-px h-6 bg-purple-500/30 mx-1"></div>
          
          <button
             onClick={() => setShowJoinModal(true)}
             className="relative flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-full transition-colors hover:bg-blue-500/20 text-blue-300 hover:text-blue-200 border border-transparent hover:border-blue-400/30"
          >
             <KeyRound className="w-4 h-4" />
             Join Game
          </button>
        </nav>
      </div>

      <AnimatePresence>
        {showJoinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="bg-[var(--color-glass-surface)] border border-[var(--color-glass-border)] p-6 rounded-3xl w-full max-w-sm shadow-[0_0_30px_rgba(59,130,246,0.3)]"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                  <KeyRound className="w-5 h-5 text-blue-400" /> Join Room
                </h3>
                <button onClick={() => setShowJoinModal(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleJoinSubmit} className="flex flex-col gap-4">
                <input
                  type="text"
                  maxLength={4}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Paste 4-Digit ID..."
                  className="w-full px-4 py-3 bg-black/40 border-2 border-blue-500/30 focus:border-blue-500 focus:outline-none rounded-xl text-center font-mono font-bold text-lg text-white placeholder-gray-500 transition-colors"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={joinCode.length !== 4}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/25"
                >
                  Join Match <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
