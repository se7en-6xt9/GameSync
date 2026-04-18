import React, { useEffect, useState } from 'react';
import { useUserStore } from '../store/userStore';
import { X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function NamePopup() {
  const { isNamePopupOpen, setNamePopupOpen, userId, setUserData } = useUserStore();
  const [name, setName] = useState('');

  // Handle hardware back button closing popup
  useEffect(() => {
    if (isNamePopupOpen) {
      window.history.pushState({ popup: 'name' }, '', '#enter-name');
      const handlePopState = () => {
        setNamePopupOpen(false);
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, [isNamePopupOpen, setNamePopupOpen]);

  // Read current or clear
  useEffect(() => {
    if (isNamePopupOpen) {
      const current = useUserStore.getState().username;
      setName(current || '');
    }
  }, [isNamePopupOpen]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length > 0) {
      setUserData(userId, name.trim());
      closePopup();
    }
  };

  const closePopup = () => {
    setNamePopupOpen(false);
    if (window.location.hash === '#enter-name') {
      window.history.back(); // Revert URL hash securely
    }
  };

  return (
    <AnimatePresence>
      {isNamePopupOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closePopup}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-[var(--color-purple-900)] border border-[var(--color-glass-border)] p-6 rounded-3xl shadow-2xl"
          >
            <button 
              onClick={closePopup} 
              className="absolute top-4 right-4 p-2 text-purple-300 hover:text-white bg-white/5 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold mb-2">Who are you?</h2>
            <p className="text-purple-300 text-sm mb-6">Enter your name to play matches and save your stats.</p>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="E.g. ShadowSlayer"
                className="bg-black/20 border border-[var(--color-glass-border)] rounded-xl px-4 py-4 text-white focus:outline-none focus:border-purple-400 text-lg font-medium"
                autoFocus
              />
              <button 
                type="submit" 
                disabled={!name.trim()} 
                className="flex items-center justify-center gap-2 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold disabled:opacity-50 transition-colors"
              >
                Let's Go <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
