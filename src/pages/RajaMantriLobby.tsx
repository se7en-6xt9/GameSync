import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, User, Users, Play, ShieldAlert, Cpu, Crown, Scroll, Shield, Sparkles } from 'lucide-react';

const ROLE_ICONS = {
  Raja: Crown,
  Mantri: Scroll,
  Sipahi: Shield,
  Chor: ShieldAlert,
};

export default function RajaMantriLobby() {
  const navigate = useNavigate();
  const { username, userId, setNamePopupOpen } = useUserStore();
  
  const [activeTab, setActiveTab] = useState<'offline' | 'online'>('offline');
  const [offlineMode, setOfflineMode] = useState<'pass-and-play' | 'vs-computer'>('vs-computer');
  
  const [totalRounds, setTotalRounds] = useState<number>(4);
  const [joinCode, setJoinCode] = useState('');
  const [isCreatingOnline, setIsCreatingOnline] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);

  // Player Names for Local Pass and Play
  const [playerNames, setPlayerNames] = useState<string[]>(['', '', '', '']);

  useEffect(() => {
    if (window !== window.top) {
      const referrer = document.referrer;
      const parentEnv = import.meta.env.VITE_PARENT_ORIGIN || 'melodysync';
      if (referrer && referrer.includes(parentEnv.replace('https://', ''))) {
        setIsEmbedded(true);
      }
    }
  }, []);

  // Update first player's name with username when it loads
  useEffect(() => {
    if (username) {
      setPlayerNames(prev => {
        const copy = [...prev];
        copy[0] = username;
        return copy;
      });
    }
  }, [username]);

  const handlePlayerNameChange = (index: number, val: string) => {
    setPlayerNames(prev => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleJoinWithCode = () => {
    if (!username.trim()) {
      setNamePopupOpen(true);
      return;
    }
    if (joinCode.length === 4) {
      navigate(`/rajamantrigame/online?roomId=${joinCode}`);
    }
  };

  const startOfflineGame = () => {
    if (!username.trim()) {
      setNamePopupOpen(true);
      return;
    }

    if (offlineMode === 'pass-and-play') {
      // Validate unique player names and presence
      const finalNames = playerNames.map((name, i) => name.trim() || `Player ${i + 1}`);
      const uniqueNames = new Set(finalNames);
      if (uniqueNames.size !== 4) {
        alert("All 4 player names must be unique!");
        return;
      }
      
      const queryParams = new URLSearchParams({
        mode: 'pvp-local',
        rounds: totalRounds.toString(),
        p1: finalNames[0],
        p2: finalNames[1],
        p3: finalNames[2],
        p4: finalNames[3],
        clearOld: 'true'
      });
      navigate(`/rajamantrigame/local?${queryParams.toString()}`);
    } else {
      // Vs Computer
      const finalHumanName = playerNames[0].trim() || username || 'You';
      const queryParams = new URLSearchParams({
        mode: 'computer',
        rounds: totalRounds.toString(),
        p1: finalHumanName,
        clearOld: 'true'
      });
      navigate(`/rajamantrigame/computer?${queryParams.toString()}`);
    }
  };

  const createOnlineGame = async () => {
    if (!username.trim()) {
      setNamePopupOpen(true);
      return;
    }
    setIsCreatingOnline(true);
    try {
      const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
      
      // Initialize an empty but configurable Raja Mantri state
      await setDoc(doc(db, 'games', roomCode), {
        gameType: 'rajamantri',
        mode: 'online',
        roomId: roomCode,
        hostId: userId,
        status: 'waiting',
        maxPlayers: 4,
        players: [userId],
        playerDetails: {
          [userId as string]: {
            name: username,
            isReady: false,
            isBot: false,
          }
        },
        rajaMantriState: {
          round: 1,
          totalRounds: totalRounds,
          phase: 'waiting_players',
          roles: {},
          revealedRoles: {},
          playerRevealedLocal: {},
          sipahiUserId: '',
          guessedChorUserId: '',
          chorUserId: '',
          rajaUserId: '',
          mantriUserId: '',
          guessIsCorrect: false,
          roundScores: {},
          cumulativeScores: {},
          history: []
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      navigate(`/rajamantrigame/online?roomId=${roomCode}`);
    } catch (e) {
      console.error(e);
      alert('Failed to create online room. Please try again.');
    } finally {
      setIsCreatingOnline(false);
    }
  };

  return (
    <div className={`px-4 max-w-4xl mx-auto min-h-screen flex flex-col items-center justify-center ${isEmbedded ? 'pt-8 pb-8' : 'pt-24 pb-12'}`}>
      
      <motion.button
        whileHover={{ x: -5 }}
        onClick={() => navigate('/')}
        className="self-start flex items-center gap-2 text-purple-300 hover:text-white mb-8 border border-white/10 px-4 py-2 rounded-full hover:bg-white/5 transition-all w-fit font-semibold"
      >
        <ArrowLeft className="w-5 h-5" /> Back to Hub
      </motion.button>

      <div className="w-full bg-[var(--color-glass-surface)] backdrop-blur-2xl border border-[var(--color-glass-border)] rounded-[2.5rem] p-8 md:p-12 shadow-[0_0_50px_rgba(157,23,77,0.15)] flex flex-col items-center relative overflow-hidden">
        
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex gap-2 items-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-tr from-amber-500 to-red-500 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-6">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <div className="w-12 h-12 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg transform rotate-12">
            <Shield className="w-6 h-6 text-white" />
          </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-rose-300 to-purple-400 mb-2 text-center pb-2 uppercase tracking-wide">
          Raja Mantri Chor Sipahi
        </h1>
        <p className="text-purple-200/80 mb-8 text-center max-w-lg text-sm md:text-base">
          A timeless local and online social game of roles, deduction, and bluffing. Guess the Chor correctly to protect your score!
        </p>

        {/* Tab Selector */}
        <div className="flex gap-2 bg-black/40 p-1.5 rounded-full border border-white/10 mb-8 w-full max-w-md">
          <button
            onClick={() => setActiveTab('offline')}
            className={`flex-1 py-3 px-6 rounded-full font-bold text-sm tracking-wide transition-all ${
              activeTab === 'offline' 
                ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md shadow-rose-500/15' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Offline Modes
          </button>
          <button
            onClick={() => setActiveTab('online')}
            className={`flex-1 py-3 px-6 rounded-full font-bold text-sm tracking-wide transition-all ${
              activeTab === 'online' 
                ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md shadow-rose-500/15' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Online Multiplayer
          </button>
        </div>

        {activeTab === 'offline' ? (
          <div className="w-full max-w-2xl flex flex-col gap-6">
            
            {/* Mode Option Card Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => setOfflineMode('vs-computer')}
                className={`p-6 rounded-2xl text-left border transition-all flex items-start gap-4 ${
                  offlineMode === 'vs-computer'
                    ? 'bg-amber-500/10 border-amber-500 shadow-md shadow-amber-500/5'
                    : 'bg-black/30 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="p-3 bg-amber-500/20 rounded-xl">
                  <Cpu className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">Vs Computer</h3>
                  <p className="text-xs text-purple-200/60 mt-1">Play with 3 smart AI bots. Perfect for single player!</p>
                </div>
              </button>

              <button
                onClick={() => setOfflineMode('pass-and-play')}
                className={`p-6 rounded-2xl text-left border transition-all flex items-start gap-4 ${
                  offlineMode === 'pass-and-play'
                    ? 'bg-rose-500/10 border-rose-500 shadow-md shadow-rose-500/5'
                    : 'bg-black/30 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="p-3 bg-rose-500/20 rounded-xl">
                  <Users className="w-6 h-6 text-rose-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">Pass & Play</h3>
                  <p className="text-xs text-purple-200/60 mt-1">4 players on one physical device. Pass to reveal roles!</p>
                </div>
              </button>
            </div>

            {/* Custom Configuration Section */}
            <div className="bg-black/40 border border-white/5 rounded-3xl p-6 flex flex-col gap-5">
              
              {/* Round Picker */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/5 pb-5">
                <div>
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" /> Game Duration
                  </h4>
                  <p className="text-xs text-purple-200/60 mt-0.5">Configure how many rounds to play</p>
                </div>
                <div className="flex gap-2">
                  {[1, 4, 8].map(rounds => (
                    <button
                      key={`rounds-${rounds}`}
                      onClick={() => setTotalRounds(rounds)}
                      className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                        totalRounds === rounds
                          ? 'bg-white text-purple-900 shadow-lg'
                          : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {rounds} {rounds === 1 ? 'Round' : 'Rounds'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Player names inputs */}
              <div className="flex flex-col gap-3">
                <h4 className="font-bold text-white text-sm">Player Details</h4>
                
                {offlineMode === 'vs-computer' ? (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-purple-200/60">Your Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-3.5 w-5 h-5 text-purple-300/40" />
                      <input
                        type="text"
                        maxLength={15}
                        value={playerNames[0]}
                        onChange={(e) => handlePlayerNameChange(0, e.target.value)}
                        placeholder="Enter your name..."
                        className="w-full pl-12 pr-4 py-3 bg-black/60 border border-white/10 focus:border-amber-500 focus:outline-none rounded-xl text-white font-medium"
                      />
                    </div>
                    <p className="text-[11px] text-amber-400/80 mt-1">Bots: Ramesh (Bot), Suresh (Bot), Amit (Bot)</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {playerNames.map((name, i) => (
                      <div key={`local-name-${i}`} className="flex flex-col gap-1.5">
                        <label className="text-xs text-purple-200/60">Player {i + 1} Name</label>
                        <div className="relative">
                          <User className="absolute left-4 top-3.5 w-5 h-5 text-purple-300/40" />
                          <input
                            type="text"
                            maxLength={15}
                            value={name}
                            onChange={(e) => handlePlayerNameChange(i, e.target.value)}
                            placeholder={`Player ${i + 1}`}
                            className="w-full pl-12 pr-4 py-3 bg-black/60 border border-white/10 focus:border-rose-500 focus:outline-none rounded-xl text-white font-medium"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={startOfflineGame}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-rose-500 text-white font-black rounded-2xl shadow-lg shadow-rose-500/20 hover:from-amber-400 hover:to-rose-400 flex items-center justify-center gap-2 text-lg uppercase tracking-wider"
            >
              <Play className="w-5 h-5 fill-current" /> Start Offline Match
            </motion.button>

          </div>
        ) : (
          <div className="w-full max-w-2xl flex flex-col gap-6">
            
            {/* Enter Code Option */}
            <div className="bg-black/40 border border-white/10 rounded-3xl p-6 flex flex-col sm:flex-row gap-5 items-center justify-between">
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-white font-bold text-lg">Join Existing Room</h3>
                <p className="text-purple-200/50 text-xs mt-0.5">Enter the 4-digit code shared by the host.</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input 
                  type="text"
                  maxLength={4}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Code"
                  className="w-24 bg-black/60 border border-white/10 rounded-xl px-2 py-3 text-white font-mono text-center focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-lg font-black"
                />
                <button 
                  disabled={joinCode.length !== 4}
                  onClick={handleJoinWithCode}
                  className="bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-all text-sm flex-1 sm:flex-none uppercase tracking-wider"
                >
                  Join
                </button>
              </div>
            </div>

            {/* Host Online Options */}
            <div className="bg-black/40 border border-white/5 rounded-3xl p-6 flex flex-col gap-5">
              <div className="flex flex-col gap-1 border-b border-white/5 pb-4">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-400" /> Host Game Setup
                </h3>
                <p className="text-purple-200/50 text-xs">Create a new lobby that other players can join.</p>
              </div>

              {/* Round Selector */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-white text-sm">Number of Rounds</h4>
                  <p className="text-xs text-purple-200/60">Configure default duration for online lobby</p>
                </div>
                <div className="flex gap-2">
                  {[1, 4, 8].map(rounds => (
                    <button
                      key={`online-rounds-${rounds}`}
                      onClick={() => setTotalRounds(rounds)}
                      className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                        totalRounds === rounds
                          ? 'bg-white text-purple-900 shadow-lg'
                          : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {rounds} {rounds === 1 ? 'Round' : 'Rounds'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={isCreatingOnline}
              onClick={createOnlineGame}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-rose-500 text-white font-black rounded-2xl shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 text-lg uppercase tracking-wider disabled:opacity-50 cursor-pointer"
            >
              {isCreatingOnline ? (
                <span className="animate-pulse">Provisioning Room...</span>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" /> Create Online Lobby
                </>
              )}
            </motion.button>

          </div>
        )}

      </div>
    </div>
  );
}
