import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useUserStore } from '../store/userStore';
import { Gamepad2, Play, Users, Clock, Trash2 } from 'lucide-react';
import { cn } from '../components/Navbar';

export default function Home() {
  const navigate = useNavigate();
  const { userId, username, setNamePopupOpen, setActiveGameId } = useUserStore();
  const [recentGames, setRecentGames] = useState<any[]>([]);
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    if (window !== window.top) {
      const referrer = document.referrer;
      const parentEnv = import.meta.env.VITE_PARENT_ORIGIN || 'melodysync';
      if (referrer && referrer.includes(parentEnv.replace('https://', ''))) {
        setIsEmbedded(true);
      }
    }
    
    // Load recent active games
    if (userId) {
      const fetchRecent = async () => {
        try {
          const gamesRef = collection(db, 'games');
          // Fetch any games that involve this user
          const q = query(gamesRef, where('players', 'array-contains', userId));
          const snapshot = await getDocs(q);
          
          let active = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((g: any) => g.status === 'playing' || g.status === 'waiting')
            .sort((a: any, b: any) => b.updatedAt?.toMillis() - a.updatedAt?.toMillis());

          // Deduplicate visibly: Keep only the ONE most recent session per mode type!
          const uniqueDict = new Map();
          active.forEach(game => {
              if (!uniqueDict.has(game.mode)) {
                  uniqueDict.set(game.mode, game);
              }
          });
          
          setRecentGames(Array.from(uniqueDict.values()).slice(0, 5));
        } catch(e) {
          console.error("Error fetching games", e);
        }
      };
      
      fetchRecent();
    }
  }, [userId]);

  const handleOpenGameLobby = (lobbyRoute: string) => {
    if (!username.trim()) {
       setNamePopupOpen(true);
       return;
    }
    navigate(lobbyRoute);
  };

  const jumpToGame = (gameId: string, currentMode: string) => {
    // Save to zustand local memory so the Game route knows which specific game to mount
    setActiveGameId(gameId);
    
    // If it's a specific mode, and it matches online logic
    if (currentMode === 'pvp-online') {
      navigate(`/game/online`);
    } else {
      navigate(`/game/${currentMode}`);
    }
  };

  const deleteGameRecord = async (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'games', gameId));
      // local memory clear if it matches
      const currentActive = useUserStore.getState().activeGameId;
      if (currentActive === gameId) setActiveGameId(null);
      setRecentGames(prev => prev.filter(g => g.id !== gameId));
    } catch(err) {
      console.error(err);
    }
  };

  return (
    <div className={cn(
      "px-4 max-w-7xl mx-auto min-h-screen flex flex-col",
      isEmbedded ? "pt-8 pb-8" : "pt-28 pb-16"
    )}>
      
      {/* Recently Played Horizontal Section */}
      {recentGames.length > 0 && (
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white">Continue Playing</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
            {recentGames.map((game) => (
              <motion.div
                key={game.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => jumpToGame(game.id, game.mode)}
                className="snap-start flex-shrink-0 w-64 p-5 rounded-2xl bg-[var(--color-glass-surface)] backdrop-blur-md border border-[var(--color-glass-border)] cursor-pointer hover:border-purple-400/50 transition-all shadow-lg group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs font-bold px-2 py-1 bg-white/10 rounded-md text-purple-200 uppercase tracking-wider">
                    Tic-Tac-Toe
                  </span>
                  <div className="flex gap-2">
                    <span className="flex items-center justify-center gap-1 text-[10px] text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                      {game.status === 'playing' ? (
                        <><span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> Live</>
                      ) : (
                        <><span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" /> Waiting</>
                      )}
                    </span>
                    <button
                      onClick={(e) => deleteGameRecord(e, game.id)}
                      className="p-1.5 text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 rounded-md transition-colors"
                      title="Delete Game"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-sm font-semibold mb-1">
                  Vs. {game.playerX === userId ? (game.playerOName || 'Unknown / AI') : (game.playerXName || 'Unknown / AI')}
                </div>
                <div className="text-xs text-purple-300">
                  {game.status === 'playing' ? (
                    `Turn: ${game.currentTurn === (game.playerX === userId ? 'X' : 'O') ? "Yours!" : "Waiting..."}`
                  ) : "Waiting for player..."}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* All Games Grid */}
      <div className="flex items-center gap-2 mb-6 mt-4">
        <Gamepad2 className="w-6 h-6 text-fuchsia-400" />
        <h2 className="text-3xl font-black bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">Platform Games</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Tic-Tac-Toe Card */}
        <motion.div
          whileHover={{ y: -5 }}
          onClick={() => handleOpenGameLobby('/tictactoe')}
          className="group relative cursor-pointer rounded-3xl overflow-hidden bg-black/40 border border-[var(--color-glass-border)] aspect-[4/3] shadow-2xl"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/40 to-purple-900/90 z-10" />
          <div className="absolute inset-x-0 bottom-0 p-6 z-20">
            <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-fuchsia-300 transition-colors">Tic-Tac-Toe</h3>
            <p className="text-purple-200 text-sm mb-4">Classic childhood game reimagined for online PvP.</p>
            <div className="flex items-center gap-4">
              <span className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-sm font-medium text-white flex items-center gap-2 transition-colors">
                <Play className="w-4 h-4" /> Play Now
              </span>
              <span className="flex items-center gap-1 text-xs text-purple-300">
                <Users className="w-3 h-3" /> 2 Players
              </span>
            </div>
          </div>
          
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-30 group-hover:opacity-50 transition-opacity duration-500 z-0 flex items-center justify-center">
            {/* Abstract visual for card background */}
             <div className="grid grid-cols-3 gap-2 w-48 h-48 rotate-12 scale-110">
               {Array(9).fill(null).map((_, i) => (
                 <div key={i} className="bg-white/10 rounded-lg shadow-inner flex items-center justify-center">
                    {i % 2 === 0 && <span className="text-4xl text-blue-400 font-bold">X</span>}
                    {i === 5 && <span className="text-4xl text-fuchsia-400 font-bold">O</span>}
                 </div>
               ))}
             </div>
          </div>
        </motion.div>

        {/* Placeholder for future games */}
        <div className="rounded-3xl border border-dashed border-purple-500/30 flex flex-col items-center justify-center p-8 aspect-[4/3] bg-purple-900/10">
           <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mb-4">
             <Gamepad2 className="w-8 h-8 text-purple-400/50" />
           </div>
           <p className="text-purple-400 font-medium">More games coming soon...</p>
        </div>

      </div>
    </div>
  );
}
