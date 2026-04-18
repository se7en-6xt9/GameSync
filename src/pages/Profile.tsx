import { motion } from 'motion/react';
import { useUserStore } from '../store/userStore';
import React, { useState, useEffect } from 'react';
import { User, Save } from 'lucide-react';

export default function Profile() {
  const { username, userId, setUserData } = useUserStore();
  const [nameInput, setNameInput] = useState(username);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    setNameInput(username);
  }, [username]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      setUserData(userId, nameInput.trim());
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2000);
    }
  };

  return (
    <div className="pt-32 pb-16 px-4 max-w-xl mx-auto min-h-screen flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full bg-[var(--color-glass-surface)] backdrop-blur-xl border border-[var(--color-glass-border)] rounded-3xl p-8 shadow-2xl"
      >
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-purple-500/20 border border-purple-400/30 flex items-center justify-center">
            <User className="w-8 h-8 text-purple-300" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-br from-white to-purple-400 bg-clip-text text-transparent">Profile</h1>
            <p className="text-purple-300 text-sm">Set your gamer tag</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-purple-200">Player Name</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="bg-black/20 border border-[var(--color-glass-border)] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
              placeholder="Enter your name"
              required
            />
          </div>

          <button
            type="submit"
            className="flex items-center justify-center gap-2 mt-4 py-4 bg-white text-purple-900 rounded-xl font-bold shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-shadow"
          >
            <Save className="w-5 h-5" /> {savedMessage ? 'Saved!' : 'Save'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
