import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { Gamepad2, User, KeyRound, X, ArrowRight, Download, Smartphone, Share } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// History state for iOS back button closure
const MODAL_HASH = '#install-info';

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

  // PWA States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [showiOSModal, setShowiOSModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if embedded
    if (window !== window.top) {
      const referrer = document.referrer;
      const parentEnv = import.meta.env.VITE_PARENT_ORIGIN || 'melodysync';
      if (referrer && referrer.includes(parentEnv.replace('https://', ''))) {
        setIsEmbedded(true);
      }
    }

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Initial check for standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    
    if (!isStandalone) {
      if (isIOSDevice) {
        setShowInstallBtn(true);
      }
    }

    // Capture beforeinstallprompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for window resize or visibility to hide button if installed mid-session
    const checkStatus = () => {
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setShowInstallBtn(false);
      }
    };
    checkStatus();

    // Listen for hash change to close iOS modal via "back" button
    const handleHashChange = () => {
      if (window.location.hash !== MODAL_HASH) {
        setShowiOSModal(false);
      }
    };
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleInstallClick = () => {
    if (isIOS) {
      setShowiOSModal(true);
      window.location.hash = MODAL_HASH;
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
          setShowInstallBtn(false);
        }
        setDeferredPrompt(null);
      });
    }
  };

  const closeiOSModal = () => {
    setShowiOSModal(false);
    if (window.location.hash === MODAL_HASH) {
      window.history.back();
    }
  };

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

          {showInstallBtn && (
            <>
              <div className="w-px h-6 bg-purple-500/30 mx-1"></div>
              <button
                onClick={handleInstallClick}
                className="relative flex items-center gap-2 px-6 py-2.5 text-sm font-black rounded-full transition-all bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)] hover:shadow-[0_0_20px_rgba(249,115,22,0.6)] animate-pulse hover:animate-none group"
              >
                <Download className="w-4 h-4 group-hover:bounce" />
                Install App
              </button>
            </>
          )}
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

      {/* iOS Install Modal */}
      <AnimatePresence>
        {showiOSModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={closeiOSModal}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-[#0a0f1e] border-t sm:border border-white/10 p-8 rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full max-w-md shadow-2xl relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-50"></div>
              
              <button 
                onClick={closeiOSModal}
                className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors border border-white/10"
              >
                <X className="w-6 h-6 text-white" />
              </button>

              <div className="flex flex-col items-center text-center gap-6 mt-4">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-blue-500/20 rotate-3">
                  <Smartphone className="w-10 h-10 text-white" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-white tracking-tight">Install on iOS</h3>
                  <p className="text-blue-200/60 text-sm leading-relaxed px-4">Follow these simple steps to add Melody Games to your home screen.</p>
                </div>

                <div className="w-full bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
                  <div className="flex items-center gap-4 group">
                    <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center font-black text-blue-400 border border-white/5 group-hover:scale-110 transition-transform">1</div>
                    <p className="text-left text-white font-medium flex items-center gap-2">
                      Tap the <span className="bg-white/10 p-1.5 rounded-lg border border-white/20"><Share className="w-4 h-4 inline text-blue-400" /></span> Share icon.
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-4 group">
                    <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center font-black text-blue-400 border border-white/5 group-hover:scale-110 transition-transform">2</div>
                    <p className="text-left text-white font-medium">Scroll down and select <span className="text-blue-400 font-bold block sm:inline">"Add to Home Screen"</span></p>
                  </div>
                </div>

                <button 
                  onClick={closeiOSModal}
                  className="w-full py-4 bg-white text-[#0a0f1e] font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all text-lg shadow-xl shadow-white/10"
                >
                  Got it!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
