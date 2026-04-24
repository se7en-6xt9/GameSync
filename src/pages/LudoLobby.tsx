import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, User, Users, Play, Crown } from 'lucide-react';
import { cn } from '../components/Navbar';

export default function LudoLobby() {
  const navigate = useNavigate();
  const { username, userId } = useUserStore();
  const [isCreatingOnline, setIsCreatingOnline] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState(2); // 2, 3, or 4 players
  const [botPlayerColor, setBotPlayerColor] = useState('red');

  const createOnlineGame = async () => {
    setIsCreatingOnline(true);
    try {
      const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
      const docRef = await addDoc(collection(db, 'games'), {
        gameType: 'ludo',
        mode: 'pvp-online',
        roomId: roomCode,
        hostId: userId,
        status: 'waiting',
        maxPlayers: selectedPlayers,
        players: [userId],
        // Player details, keyed by user ID
        playerDetails: {
           [userId as string]: {
              name: username,
              color: null, // Host will select color inside the game lobby pre-start
              isReady: false
           }
        },
        ludoState: {
           turn: null, // will be set once game starts
           diceValue: null,
           tokens: {}
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      navigate(`/ludogame/online?roomId=${roomCode}`);
    } catch (e) {
      console.error(e);
      alert('Failed to create room. Please try again.');
    } finally {
      setIsCreatingOnline(false);
    }
  };

  return (
    <div className="pt-24 pb-12 px-4 max-w-4xl mx-auto min-h-screen flex flex-col items-center justify-center">
      <motion.button
        whileHover={{ x: -5 }}
        onClick={() => navigate('/')}
        className="self-start flex items-center gap-2 text-purple-300 hover:text-white mb-8 border border-white/10 px-4 py-2 rounded-full hover:bg-white/5 transition-all w-fit"
      >
        <ArrowLeft className="w-5 h-5" /> Back to Hub
      </motion.button>

      <div className="w-full bg-[var(--color-glass-surface)] backdrop-blur-2xl border border-[var(--color-glass-border)] rounded-[2.5rem] p-8 md:p-12 shadow-[0_0_50px_rgba(234,179,8,0.15)] flex flex-col items-center">
        <div className="w-20 h-20 bg-gradient-to-br from-red-500 via-yellow-400 to-green-500 rounded-3xl mb-6 shadow-xl flex items-center justify-center rotate-3 border-2 border-white/20">
          <Crown className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-yellow-300 to-green-400 mb-4 text-center pb-2">
          Ludo King Clone
        </h1>
        <p className="text-purple-200/80 mb-12 text-center max-w-lg">
          Classic Ludo board game. Play locally against AI, pass-and-play with friends, or host a room online (2-4 players)!
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
           {/* Offline Options */}
           <div className="flex flex-col gap-4">
              <h3 className="text-lg font-bold text-white mb-2 flex flex-col items-center border-b border-white/10 pb-4">
                 Offline Modes
              </h3>
              <div className="w-full bg-black/40 hover:bg-blue-600/10 border border-blue-500/30 p-5 rounded-2xl flex flex-col items-center gap-3 transition-colors relative">
                <div className="flex justify-center gap-2 mb-2 w-full">
                    {['red', 'green', 'yellow', 'blue'].map(color => (
                        <button
                          key={`botcolor-${color}`}
                          onClick={() => setBotPlayerColor(color)}
                          className={cn("w-10 h-10 rounded-full shadow-inner border-2 transition-all", botPlayerColor === color ? `ring-2 ring-white scale-110 border-${color}-400 bg-${color}-500` : `border-transparent bg-${color}-500/50 hover:bg-${color}-500`)}
                          title={`Choose ${color}`}
                          style={{ backgroundColor: color === 'red' ? '#ef4444' : color === 'green' ? '#22c55e' : color === 'yellow' ? '#eab308' : '#3b82f6' }}
                        />
                    ))}
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/ludogame/computer?color=${botPlayerColor}&clearOld=true`)}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold p-3 rounded-xl flex items-center justify-center gap-2 shadow-lg"
                >
                  <User className="w-5 h-5" /> Vs Computer
                </motion.button>
              </div>
              
              <div className="w-full bg-black/40 hover:bg-green-600/10 border border-green-500/30 p-5 rounded-2xl flex flex-col items-center gap-3 transition-colors relative">
                <div className="flex justify-center gap-2 mb-2 w-full">
                   {[2,3,4].map(num => (
                      <button
                        key={`local-${num}`}
                        onClick={() => setSelectedPlayers(num)}
                        className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-colors flex-1", selectedPlayers === num ? 'bg-green-500 text-white' : 'bg-white/10 text-gray-400 hover:text-white hover:bg-white/20')}
                      >
                         {num} Players
                      </button>
                   ))}
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/ludogame/pvp-local?players=${selectedPlayers}&clearOld=true`)}
                  className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold p-3 rounded-xl flex items-center justify-center gap-2 shadow-lg"
                >
                  <Users className="w-5 h-5" /> Pass & Play
                </motion.button>
              </div>
           </div>

           {/* Online Options */}
           <div className="flex flex-col gap-4 h-full">
               <h3 className="text-lg font-bold text-white mb-2 flex flex-col items-center border-b border-white/10 pb-4">
                 Host Multiplayer
               </h3>
               <div className="flex-1 flex flex-col bg-black/40 hover:bg-orange-600/10 border border-orange-500/30 hover:border-orange-500 p-5 rounded-2xl transition-colors relative">
                  <div className="flex justify-center gap-2 mb-4">
                     {[2,3,4].map(num => (
                        <button
                          key={num}
                          onClick={() => setSelectedPlayers(num)}
                          className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-colors", selectedPlayers === num ? 'bg-orange-500 text-white' : 'bg-white/10 text-gray-400 hover:text-white')}
                        >
                           {num} Players
                        </button>
                     ))}
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isCreatingOnline}
                    onClick={createOnlineGame}
                    className="mt-auto w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-black rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 mt-4 cursor-pointer"
                  >
                    {isCreatingOnline ? <span className="animate-pulse">Creating...</span> : <><Play className="w-5 h-5 fill-current" /> Host Online Game</>}
                  </motion.button>
               </div>
           </div>
        </div>
      </div>
    </div>
  );
}
