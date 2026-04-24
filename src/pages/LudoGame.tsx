import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, collection, query, where, getDocs, deleteDoc, getDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { ArrowLeft, Users, User, Play, Crown, RefreshCw, VolumeX, Volume2, Trash2 } from 'lucide-react';
import { cn } from '../components/Navbar';

const COLORS = [
  { id: 'red', hex: '#ef4444', name: 'Red' },
  { id: 'blue', hex: '#3b82f6', name: 'Blue' },
  { id: 'green', hex: '#22c55e', name: 'Green' },
  { id: 'yellow', hex: '#eab308', name: 'Yellow' }
];

export default function LudoGame() {
  const { mode } = useParams();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('roomId');
  const requestedPlayers = parseInt(searchParams.get('players') || '4', 10);
  const navigate = useNavigate();
  const { userId, username, activeGameId, setActiveGameId } = useUserStore();
  
  const [gameDoc, setGameDoc] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitializingGame, setIsInitializingGame] = useState(true);
  const isInitializing = useRef(false);
  
  // Custom Dice Rolling State
  const [diceState, setDiceState] = useState<'idle' | 'rolling' | 'rolled'>('idle');
  const [currentDiceValue, setCurrentDiceValue] = useState<number>(6);
  const [isMuted, setIsMuted] = useState(false);

  const playSound = (type: 'roll' | 'move' | 'kill') => {
      if (isMuted) return;
      try {
          const audio = new Audio();
          if (type === 'roll') audio.src = 'https://cdn.freesound.org/previews/274/274404_4884214-lq.mp3';
          else if (type === 'move') audio.src = 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3';
          else if (type === 'kill') audio.src = 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3';
          audio.volume = 0.5;
          audio.play().catch(() => {});
      } catch(e) {}
  };

  const endAndDeleteGame = async () => {
      if (gameDoc?.id) {
          try {
              await deleteDoc(doc(db, 'games', gameDoc.id));
              setActiveGameId(null);
          } catch(e){}
      }
      navigate('/');
  };
  
  // Ludo Game Phase and Logic State
  const activeTurn = gameDoc?.ludoState?.turn || 'red';
  const activePhase = gameDoc?.ludoState?.phase || 'awaiting_roll'; 
  const activeTokens = gameDoc?.ludoState?.tokens || {
     red: [0,0,0,0], green: [0,0,0,0], blue: [0,0,0,0], yellow: [0,0,0,0]
  };
  const activeColors = gameDoc?.ludoState?.activeColors || ['red', 'green', 'yellow', 'blue'];

  // --- ONLINE SYNC ---
  useEffect(() => {
    if (!activeGameId || !userId) return;

    const unsub = onSnapshot(doc(db, 'games', activeGameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.gameType === 'ludo') {
           setGameDoc({ id: docSnap.id, ...data });
           
           // If we're a player in this game, ensure we're connected
           if (data.mode === 'online' && !data.players?.includes(userId)) {
              if (data.status === 'waiting' && data.players?.length < (data.maxPlayers || 4)) {
                 updateDoc(doc(db, 'games', docSnap.id), {
                    players: [...(data.players || []), userId],
                    [`playerDetails.${userId}`]: {
                       name: username,
                       color: null,
                       isReady: false
                    }
                 });
              } else {
                 // Might be full or game already playing
              }
           }
        }
      }
    });

    return () => unsub();
  }, [activeGameId, userId, username]);


  const getPathIndex = (color: string, pos: number) => {
     if (pos < 1 || pos > 52) return -1;
     const startOffsets: Record<string, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
     return (startOffsets[color] + pos - 1) % 52;
  };

  // Safe squares on the 0-51 absolute track
  const SAFE_PATH_INDEXES = [0, 8, 13, 21, 26, 34, 39, 47];

  const rollDice = () => {
     if (diceState === 'rolling' || activePhase !== 'awaiting_roll') return;
     setDiceState('rolling');
     playSound('roll');
     
     // Randomize visuals for 0.8 seconds
     const interval = setInterval(() => {
        setCurrentDiceValue(Math.floor(Math.random() * 6) + 1);
     }, 100);

     setTimeout(() => {
        clearInterval(interval);
        const finalValue = Math.floor(Math.random() * 6) + 1;
        setCurrentDiceValue(finalValue);
        setDiceState('rolled');
        
        // Evaluate valid moves
        const currentPlayerTokens = activeTokens[activeTurn as keyof typeof activeTokens] || [0,0,0,0];
        let hasValidMove = false;
        currentPlayerTokens.forEach((pos: number) => {
           if (pos === 0 && finalValue === 6) hasValidMove = true;
           if (pos > 0 && pos + finalValue <= 58) hasValidMove = true;
        });

        const newLudoState = {
           ...(gameDoc?.ludoState || {}),
           turn: activeTurn,
           diceValue: finalValue,
           tokens: activeTokens,
           phase: hasValidMove ? 'awaiting_move' : 'awaiting_roll'
        };

        if (!hasValidMove) {
           // Skip turn
           setTimeout(() => {
              setDiceState('idle'); // Send to next player's base physically
              const nextIdx = (activeColors.indexOf(activeTurn) + 1) % activeColors.length;
              const skippedState = { ...newLudoState, turn: activeColors[nextIdx] };
              
              setGameDoc((prev: any) => ({ ...prev, ludoState: skippedState }));
              if (gameDoc?.id) {
                  updateDoc(doc(db, 'games', gameDoc.id), { ludoState: skippedState }).catch(console.error);
              }
           }, 1500); // Wait 1.5s in center reading the invalid dice result before moving token
        } else {
           // Immediately render locally what happened
           setGameDoc((prev: any) => ({ ...prev, ludoState: newLudoState }));

           // Save to Firebase
           if (gameDoc?.id) {
              updateDoc(doc(db, 'games', gameDoc.id), { ludoState: newLudoState }).catch(console.error);
           }
        }

     }, 800); // 0.8s roll
  };

  const handleTokenClick = (color: string, tokenIndex: number, isBotClick = false) => {
     if (activePhase !== 'awaiting_move' || color !== activeTurn) return;
     if (mode === 'computer' && activeTurn !== 'red' && !isBotClick) return; // Only bot moves its tokens

     const currentPos = activeTokens[color as keyof typeof activeTokens][tokenIndex];
     const diceVal = gameDoc?.ludoState?.diceValue || 0;

     let newPos = currentPos;
     if (currentPos === 0 && diceVal === 6) {
        newPos = 1;
     } else if (currentPos > 0 && currentPos + diceVal <= 58) {
        newPos = currentPos + diceVal;
     } else {
        return; // Invalid move
     }

     const newTokens = { ...activeTokens, [color]: [...activeTokens[color as keyof typeof activeTokens]] };
     newTokens[color as keyof typeof newTokens][tokenIndex] = newPos;

     let killedSomething = false;

     // Calculate KILL Logic based on standard Ludo rules (Displacement)
     if (newPos > 0 && newPos <= 52) {
         const pathIdx = getPathIndex(color, newPos);
         if (!SAFE_PATH_INDEXES.includes(pathIdx)) {
             // Check if opponent token is on this absolute index
             ['red', 'green', 'yellow', 'blue'].forEach(oppColor => {
                 if (oppColor !== color) {
                     newTokens[oppColor as keyof typeof newTokens] = newTokens[oppColor as keyof typeof newTokens].map((oppPos: number) => {
                         if (oppPos > 0 && oppPos <= 52 && getPathIndex(oppColor, oppPos) === pathIdx) {
                             killedSomething = true;
                             return 0; // Send back to base!
                         }
                         return oppPos;
                     });
                 }
             });
         }
     }

     if (killedSomething) playSound('kill');
     else playSound('move');

     // Turn cycling based on activeColors
     const nextIdx = (activeColors.indexOf(activeTurn) + 1) % activeColors.length;
     const nextTurn = (diceVal === 6 || killedSomething || newPos === 58) ? activeTurn : activeColors[nextIdx];

     const newLudoState = {
        ...(gameDoc?.ludoState || {}),
        turn: nextTurn,
        phase: 'awaiting_roll',
        tokens: newTokens
     };

     setDiceState('idle'); // Visually send dice to the current/next player's base immediately
     setGameDoc((prev: any) => ({ ...prev, ludoState: newLudoState }));
     
     if (gameDoc?.id) {
        updateDoc(doc(db, 'games', gameDoc.id), { ludoState: newLudoState, updatedAt: serverTimestamp() }).catch(console.error);
     }
  };

  // --- BOT ENGINE (PvE) ---
  useEffect(() => {
      if (mode === 'computer' && activeTurn !== 'red' && activePhase === 'awaiting_roll') {
          const timer = setTimeout(() => {
              if (diceState === 'idle') rollDice();
          }, 1500);
          return () => clearTimeout(timer);
      }
  }, [mode, activeTurn, activePhase, diceState]);

  useEffect(() => {
      if (mode === 'computer' && activeTurn !== 'red' && activePhase === 'awaiting_move') {
          // AI selects the best move
          const timer = setTimeout(() => {
              const tokens = activeTokens[activeTurn as keyof typeof activeTokens];
              const diceVal = gameDoc?.ludoState?.diceValue || 0;

              let bestIndex = -1;
              let highestPriority = -1;

              tokens.forEach((pos: number, idx: number) => {
                  let priority = -1;
                  let newPos = pos;
                  if (pos === 0 && diceVal === 6) { priority = 3; newPos = 1; } // Open token
                  else if (pos > 0 && pos + diceVal <= 58) {
                      newPos = pos + diceVal;
                      priority = 1; // Normal move
                      // Check kill possibility (higher priority)
                      if (newPos <= 52) {
                          const pIdx = getPathIndex(activeTurn, newPos);
                          if (!SAFE_PATH_INDEXES.includes(pIdx)) {
                              let canKill = ['red','green','yellow','blue'].some(c => c !== activeTurn && activeTokens[c as keyof typeof activeTokens].some(op => op > 0 && op <= 52 && getPathIndex(c, op) === pIdx));
                              if (canKill) priority = 10;
                          }
                          if (SAFE_PATH_INDEXES.includes(pIdx)) priority = 5; // Land on Safe zone
                      }
                      if (newPos === 58) priority = 8; // Score point (Home)
                  }
                  
                  if (priority > highestPriority) {
                      highestPriority = priority;
                      bestIndex = idx;
                  }
              });

              if (bestIndex !== -1) {
                  handleTokenClick(activeTurn, bestIndex, true);
              }
          }, 1500);
          return () => clearTimeout(timer);
      }
  }, [mode, activeTurn, activePhase, gameDoc?.ludoState?.diceValue]);

  // Helper mapping absolute positions to 15x15 grids
  const getCoordinatesForPosition = (color: string, pos: number) => {
     if (pos === 0) return null;
     const path52 = [
        {r:6,c:1},{r:6,c:2},{r:6,c:3},{r:6,c:4},{r:6,c:5},{r:5,c:6},{r:4,c:6},{r:3,c:6},{r:2,c:6},{r:1,c:6},{r:0,c:6},
        {r:0,c:7},{r:0,c:8},{r:1,c:8},{r:2,c:8},{r:3,c:8},{r:4,c:8},{r:5,c:8},{r:6,c:9},{r:6,c:10},{r:6,c:11},{r:6,c:12},{r:6,c:13},{r:6,c:14},
        {r:7,c:14},{r:8,c:14},{r:8,c:13},{r:8,c:12},{r:8,c:11},{r:8,c:10},{r:8,c:9},{r:9,c:8},{r:10,c:8},{r:11,c:8},{r:12,c:8},{r:13,c:8},{r:14,c:8},
        {r:14,c:7},{r:14,c:6},{r:13,c:6},{r:12,c:6},{r:11,c:6},{r:10,c:6},{r:9,c:6},{r:8,c:5},{r:8,c:4},{r:8,c:3},{r:8,c:2},{r:8,c:1},{r:8,c:0},
        {r:7,c:0},{r:6,c:0}
     ];
     const startOffsets: any = { red: 0, green: 13, yellow: 26, blue: 39 };
     if (pos <= 52) return path52[(startOffsets[color] + pos - 1) % 52];
     
     const homeStretches: any = {
        red: [{r:7,c:1},{r:7,c:2},{r:7,c:3},{r:7,c:4},{r:7,c:5},{r:7,c:6}],
        green: [{r:1,c:7},{r:2,c:7},{r:3,c:7},{r:4,c:7},{r:5,c:7},{r:6,c:7}],
        yellow: [{r:7,c:13},{r:7,c:12},{r:7,c:11},{r:7,c:10},{r:7,c:9},{r:7,c:8}],
        blue: [{r:13,c:7},{r:12,c:7},{r:11,c:7},{r:10,c:7},{r:9,c:7},{r:8,c:7}]
     };
     return homeStretches[color][pos - 53];
  };

  useEffect(() => {
    if (!userId || isInitializing.current) return;

    const initializeGame = async () => {
      isInitializing.current = true;
      setIsInitializingGame(true);
      try {
        if (activeGameId && searchParams.get('clearOld') === 'true') {
           try { await deleteDoc(doc(db, 'games', activeGameId)); } catch(e) {}
           setActiveGameId(null);
        }

        // If we have roomId but no activeGameId, find it
        let currentActiveId = activeGameId;
        if (!currentActiveId && mode === 'online' && roomId) {
           const q = query(collection(db, 'games'), where('roomId', '==', roomId), where('gameType', '==', 'ludo'));
           const snap = await getDocs(q);
           if (!snap.empty) {
              currentActiveId = snap.docs[0].id;
              setActiveGameId(currentActiveId);
           } else {
              alert("Room not found!");
              navigate('/');
              return;
           }
        }

        if (currentActiveId) {
          const docRef = doc(db, 'games', currentActiveId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
             const data = snap.data();
             if (data.status !== 'finished' && data.gameType === 'ludo') {
                setGameDoc({ id: currentActiveId, ...data });
                setIsInitializingGame(false);
                return;
             }
          }
        }

        if (mode !== 'online') {
            const hostColor = searchParams.get('color') || 'red';
            const getOpposite = (c: string) => c === 'red' ? 'yellow' : c === 'yellow' ? 'red' : c === 'green' ? 'blue' : 'green';
            const standardOrder = ['red', 'green', 'yellow', 'blue'];
            
            let playersList: string[] = [];
            if (mode === 'computer') {
                playersList = [hostColor, getOpposite(hostColor)];
            } else {
                if (requestedPlayers === 2) {
                    playersList = ['red', 'yellow'];
                } else if (requestedPlayers === 3) {
                    playersList = ['red', 'green', 'yellow'];
                } else {
                    playersList = ['red', 'green', 'yellow', 'blue'];
                }
            }
            
            // Critical for exact turn-taking order mapping
            playersList.sort((a, b) => standardOrder.indexOf(a) - standardOrder.indexOf(b));
            
            const startingTurn = mode === 'computer' ? hostColor : playersList[0];

            const newLudoState = {
                turn: startingTurn,
                phase: 'awaiting_roll',
                diceValue: 1,
                activeColors: playersList,
                tokens: {
                    red: [0,0,0,0], green: [0,0,0,0], yellow: [0,0,0,0], blue: [0,0,0,0]
                }
            };

            const docRef = await addDoc(collection(db, 'games'), {
                gameType: 'ludo',
                mode: mode,
                status: 'playing',
                hostId: userId,
                players: mode === 'computer' ? [userId, 'computer'] : [userId],
                playerDetails: {
                    [userId as string]: { name: username || 'Guest', color: startingTurn }
                },
                ludoState: newLudoState,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            setActiveGameId(docRef.id);
            setGameDoc({ id: docRef.id, ludoState: newLudoState, mode });
        }
      } catch(e) { console.error(e); }
      finally { setIsInitializingGame(false); }
    };

    if (mode !== 'online' || roomId) initializeGame();
  }, [mode, userId, username, activeGameId, searchParams, setActiveGameId, requestedPlayers, roomId]);

  // Online connection logic
  useEffect(() => {
    if (!gameDoc || mode !== 'online' || !userId || !gameDoc.id) return;
    
    const players = gameDoc.players || [];
    const details = gameDoc.playerDetails || {};
    
    // Add player to game if not present and room not full
    if (!players.includes(userId)) {
       if (gameDoc.status === 'waiting' && players.length < (gameDoc.maxPlayers || 4)) {
         updateDoc(doc(db, 'games', gameDoc.id), {
            players: [...players, userId],
            [`playerDetails.${userId}`]: {
               name: username,
               color: null,
               isReady: false
            }
         }).catch(console.error);
       }
    }
  }, [gameDoc, userId, mode, username]);

  const selectColor = async (colorId: string) => {
    if (mode === 'online' && gameDoc) {
      if (gameDoc.playerDetails[userId as string]?.isReady) return; // Cannot change if ready
      
      // Check if color taken
      const isTaken = Object.values(gameDoc.playerDetails as Record<string, any>).some(p => p.color === colorId);
      if (isTaken && gameDoc.playerDetails[userId as string]?.color !== colorId) return;

      await updateDoc(doc(db, 'games', gameDoc.id), {
        [`playerDetails.${userId}.color`]: colorId
      });
    } else {
       // Local mode handling (to be built fully)
    }
  };

  const toggleReady = async () => {
    if (mode === 'online' && gameDoc) {
      const current = gameDoc.playerDetails[userId as string]?.isReady || false;
      await updateDoc(doc(db, 'games', gameDoc.id), {
        [`playerDetails.${userId}.isReady`]: !current
      });
    }
  };

  const startGame = async () => {
     if (mode === 'online' && gameDoc && gameDoc.hostId === userId) {
        // Init tokens based on colors picked
        const initTokens: Record<string, number[]> = {};
        Object.values(gameDoc.playerDetails as Record<string, any>).forEach(p => {
           if (p.color) initTokens[p.color] = [0, 0, 0, 0]; // 0 means base
        });

        // Determine first turn randomly or by rule (e.g., Red starts)
        const activeColors = Object.values(gameDoc.playerDetails as Record<string, any>).map(p => p.color).filter(Boolean);
        const startingTurn = activeColors[0] || 'red';

        await updateDoc(doc(db, 'games', gameDoc.id), {
           status: 'playing',
           'ludoState.turn': startingTurn,
           'ludoState.tokens': initTokens
        });
     }
  };

  // Rendering
  if (mode === 'online' && !gameDoc) {
     return <div className="min-h-screen flex items-center justify-center text-white">Loading Room...</div>;
  }

  const isLobbyPhase = mode === 'online' ? gameDoc?.status === 'waiting' : false; // for local, can add state
  
  if (isLobbyPhase) {
     const pDetails = gameDoc.playerDetails || {};
     const currentPlayers = Object.keys(pDetails).length;
     const maxP = gameDoc.maxPlayers;
     const myDetail = pDetails[userId as string];
     const allReadyAndColorsPicked = Object.values(pDetails).every((p: any) => p.isReady && p.color);
     const canStart = gameDoc.hostId === userId && currentPlayers >= 2 && allReadyAndColorsPicked;

     return (
       <div className="pt-24 pb-12 px-4 max-w-5xl mx-auto min-h-screen flex flex-col">
         <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-black text-white flex items-center gap-2">
              <Crown className="w-8 h-8 text-yellow-500" /> Room Lobby ({currentPlayers}/{maxP})
            </h1>
            <div className="bg-white/10 px-4 py-2 rounded-lg font-mono text-xl tracking-widest text-blue-300 border border-white/20">
              {roomId}
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Players List */}
            <div className="bg-black/40 border border-white/10 rounded-3xl p-6 shadow-xl">
               <h3 className="text-xl font-bold text-gray-300 mb-6 border-b border-white/10 pb-4">Players Connected</h3>
               <div className="flex flex-col gap-4">
                 {Object.entries(pDetails).map(([id, p]: [string, any]) => (
                   <div key={id} className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-3">
                         <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-white uppercase shadow-inner", 
                           p.color === 'red' ? 'bg-red-500' : p.color === 'blue' ? 'bg-blue-500' : p.color === 'green' ? 'bg-green-500' : p.color === 'yellow' ? 'bg-yellow-500' : 'bg-gray-600'
                         )}>
                            {p.color ? p.color[0] : '?'}
                         </div>
                         <div>
                           <p className="font-bold text-white flex items-center gap-2">
                              {p.name} {id === userId && <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">You</span>}
                           </p>
                           {id === gameDoc.hostId && <p className="text-[10px] text-yellow-500 font-black uppercase tracking-wider">Host</p>}
                         </div>
                      </div>
                      <span className={cn("text-xs font-bold px-3 py-1 rounded-full", p.isReady ? "bg-green-500/20 text-green-400" : "bg-white/10 text-gray-400")}>
                         {p.isReady ? 'READY' : 'SELECTING'}
                      </span>
                   </div>
                 ))}
                 
                 {Array.from({ length: maxP - currentPlayers }).map((_, i) => (
                    <div key={`empty-${i}`} className="flex items-center gap-3 bg-white/5 p-4 rounded-2xl border border-white/5 opacity-50 border-dashed">
                      <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center"><User className="text-gray-500 w-5 h-5" /></div>
                      <span className="text-gray-500 font-medium">Waiting for player...</span>
                    </div>
                 ))}
               </div>
            </div>

            {/* Color Selection & Actions */}
            <div className="flex flex-col gap-6">
               <div className="bg-black/40 border border-white/10 rounded-3xl p-6 shadow-xl flex-1 flex flex-col">
                  <h3 className="text-xl font-bold text-gray-300 mb-6 border-b border-white/10 pb-4">Choose Your Color</h3>
                  <div className="grid grid-cols-2 gap-4 flex-1">
                     {COLORS.map(c => {
                        const isTakenByOther = Object.entries(pDetails).some(([id, p]: [string, any]) => id !== userId && p.color === c.id);
                        const isMyColor = myDetail?.color === c.id;
                        
                        return (
                           <button
                             key={c.id}
                             disabled={isTakenByOther || myDetail?.isReady}
                             onClick={() => selectColor(c.id)}
                             className={cn(
                                "flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-4 transition-all shadow-lg",
                                isMyColor ? `scale-105 bg-white/10` : isTakenByOther ? "opacity-30 grayscale cursor-not-allowed" : "hover:bg-white/5 hover:scale-105",
                                c.id === 'red' ? (isMyColor ? 'border-red-500' : 'border-red-500/30 text-red-400') :
                                c.id === 'blue' ? (isMyColor ? 'border-blue-500' : 'border-blue-500/30 text-blue-400') :
                                c.id === 'green' ? (isMyColor ? 'border-green-500' : 'border-green-500/30 text-green-400') :
                                (isMyColor ? 'border-yellow-500' : 'border-yellow-500/30 text-yellow-400')
                             )}
                           >
                              <div className="w-12 h-12 rounded-full shadow-inner" style={{ backgroundColor: c.hex }}></div>
                              <span className="font-bold text-lg">{c.name}</span>
                              {isTakenByOther && <span className="text-xs text-red-300 bg-red-900/40 px-2 py-1 rounded-full absolute top-2 right-2">Taken</span>}
                           </button>
                        )
                     })}
                  </div>
               </div>

               {/* Ready / Start Actions */}
               <div className="flex gap-4">
                  <button
                    disabled={!myDetail?.color}
                    onClick={toggleReady}
                    className={cn(
                       "flex-1 py-4 font-black rounded-2xl shadow-xl transition-all uppercase text-lg disabled:opacity-50",
                       myDetail?.isReady ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30" : "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-400 hover:to-emerald-500"
                    )}
                  >
                     {myDetail?.isReady ? "Cancel Ready" : "I'm Ready"}
                  </button>

                  {gameDoc.hostId === userId && (
                     <button
                       disabled={!canStart}
                       onClick={startGame}
                       className="flex-1 py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-black rounded-2xl shadow-lg transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2 uppercase text-lg"
                     >
                        <Play className="fill-current w-5 h-5" /> Start Match
                     </button>
                  )}
               </div>
            </div>
         </div>
       </div>
     );
  }

  // --- LUDO BOARD RENDER PHASE ---
  return (
    <div className="pt-20 px-0 sm:px-0 lg:px-4 max-w-7xl mx-auto min-h-screen flex flex-col lg:flex-row gap-6">
       
       {/* Left / Top Controls */}
       <div className="w-full lg:w-64 flex lg:flex-col gap-4 overflow-x-auto lg:overflow-visible shrink-0 pb-2 px-2 sm:px-0">
         {/* Exit & basic options */}
         <div className="flex gap-2 w-full">
             <button onClick={() => navigate('/')} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[var(--color-glass-surface)]/60 backdrop-blur-xl border border-[var(--color-glass-border)] rounded-2xl hover:bg-white/10 transition-colors text-white font-bold whitespace-nowrap shadow-lg">
               <ArrowLeft className="w-5 h-5" /> <span className="hidden sm:inline">Back</span>
             </button>
             <button onClick={() => setIsMuted(!isMuted)} className={cn("px-4 py-3 border rounded-2xl transition-colors shadow-lg flex items-center justify-center", isMuted ? "bg-red-500/20 border-red-500/50 text-red-400" : "bg-[var(--color-glass-surface)]/60 backdrop-blur-xl border-[var(--color-glass-border)] text-white hover:bg-white/10")} title="Mute Audio">
                 {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
             </button>
         </div>
         
         {(gameDoc?.hostId === userId || mode !== 'online') && (
            <button onClick={endAndDeleteGame} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600/80 hover:bg-red-500 text-white font-bold rounded-2xl transition-colors shadow-lg">
                <Trash2 className="w-5 h-5" /> Destroy Game
            </button>
         )}
         
         <div className="p-4 bg-[var(--color-glass-surface)]/60 backdrop-blur-xl border border-[var(--color-glass-border)] rounded-2xl hidden lg:block">
           <h3 className="text-white font-black mb-2 flex items-center gap-2"><Users className="w-5 h-5 text-blue-400" /> Players</h3>
           <div className="space-y-2">
             {mode === 'online' && gameDoc && Object.entries(gameDoc.playerDetails).map(([id, p]: [string, any]) => (
                <div key={id} className={cn("px-3 py-2 rounded-xl flex items-center justify-between border shadow-inner", 
                  gameDoc?.ludoState?.turn === p.color ? `border-${p.color}-500 bg-${p.color}-500/10` : 'border-transparent bg-white/5'
                )}>
                   <div className="flex flex-col">
                     <span className="text-white font-bold text-sm truncate">{p.name} {id===userId && '(You)'}</span>
                     <span className={cn("text-[10px] uppercase font-black", `text-${p.color}-400`)}>{p.color}</span>
                   </div>
                   {gameDoc?.ludoState?.turn === p.color && <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>}
                </div>
             ))}
           </div>
         </div>
       </div>

       {/* MAIN BOARD AREA */}
       <div className="flex-1 flex flex-col items-center justify-center pointer-events-none px-0 w-full overflow-hidden">
          <div className="w-full max-w-3xl aspect-square bg-[#ececec] sm:rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden flex relative pointer-events-auto border-0 sm:border-8 border-[#2d3748]">
             {/* Simple Ludo 15x15 CSS Grid Implementation */}
             <div className="w-full h-full grid" style={{ gridTemplateColumns: 'repeat(15, 1fr)', gridTemplateRows: 'repeat(15, 1fr)' }}>
                {Array.from({ length: 225 }).map((_, i) => {
                   const r = Math.floor(i / 15);
                   const c = i % 15;
                   
                   let bg = 'bg-white border-[0.5px] border-gray-300'; // Default cell
                   let innerContent = null;

                   // Top-Left Base (RED or GREEN usually, let's say RED for top-left)
                   if (r < 6 && c < 6) { bg = 'bg-red-500 border border-red-600'; if(r>0 && r<5 && c>0 && c<5) bg='bg-white'; }
                   // Top-Right Base (GREEN)
                   else if (r < 6 && c > 8) { bg = 'bg-green-500 border border-green-600'; if(r>0 && r<5 && c>9 && c<14) bg='bg-white'; }
                   // Bottom-Left Base (BLUE)
                   else if (r > 8 && c < 6) { bg = 'bg-blue-500 border border-blue-600'; if(r>9 && r<14 && c>0 && c<5) bg='bg-white'; }
                   // Bottom-Right Base (YELLOW)
                   else if (r > 8 && c > 8) { bg = 'bg-yellow-500 border border-yellow-600'; if(r>9 && r<14 && c>9 && c<14) bg='bg-white'; }
                   
                   // Center Home
                   else if (r >= 6 && r <= 8 && c >= 6 && c <= 8) {
                      bg = ''; 
                      // Home Triangle CSS would go here, drawing a simple box for now
                      if(r===7 && c===7) bg = 'bg-gradient-to-br from-red-500 via-yellow-500 to-green-500 border-none relative overflow-hidden';
                      else bg = 'bg-gray-800 border-none';
                   }

                   // Safe Stars / Home paths (simplified visual logic for demonstration)
                   // Red Home Path
                   if (c === 7 && r > 0 && r < 6) bg = 'bg-red-500 border-[0.5px] border-red-600';
                   // Blue Home Path
                   if (r === 7 && c > 0 && c < 6) bg = 'bg-blue-500 border-[0.5px] border-blue-600';
                   // Green Home Path
                   if (r === 7 && c > 8 && c < 14) bg = 'bg-green-500 border-[0.5px] border-green-600';
                   // Yellow Home Path
                   if (c === 7 && r > 8 && r < 14) bg = 'bg-yellow-500 border-[0.5px] border-yellow-600';

                   // Starts and Safe Zones
                   if (r === 6 && c === 1) bg = 'bg-red-100';
                   if (r === 1 && c === 8) bg = 'bg-green-100';
                   if (r === 8 && c === 13) bg = 'bg-yellow-100';
                   if (r === 13 && c === 6) bg = 'bg-blue-100';
                   
                   if ((r===6&&c===1)||(r===1&&c===8)||(r===8&&c===13)||(r===13&&c===6)||(r===2&&c===6)||(r===6&&c===12)||(r===12&&c===8)||(r===8&&c===2)) {
                      innerContent = <span className="text-black/20 text-4xl mb-1 absolute font-black pointer-events-none">★</span>;
                   }

                   return (
                      <div key={i} className={cn(bg, "flex items-center justify-center relative shadow-sm border border-black/5")}>
                        {innerContent}
                      </div>
                   )
                })}

                {/* Tokens Overlays inside Bases (Dynamic) */}
                {/* Red Base */}
                <div className={cn("absolute top-[6.6%] left-[6.6%] w-[26.6%] h-[26.6%] bg-white rounded-2xl flex items-center justify-center p-[4%] grid grid-cols-2 grid-rows-2 gap-2 shadow-inner border-4", activeColors.includes('red') ? "border-red-500" : "border-gray-400 opacity-50")}>
                   {activeColors.includes('red') && [0,1,2,3].map(t => {
                      const isAtBase = activeTokens.red[t] === 0;
                      const isClickable = isAtBase && activePhase === 'awaiting_move' && activeTurn === 'red' && gameDoc?.ludoState?.diceValue === 6;
                      return (
                        <div key={t} onClick={() => isClickable && handleTokenClick('red', t)} className="w-full h-full flex items-center justify-center relative">
                           <div className={cn("w-[70%] h-[70%] rounded-full transition-all duration-300 absolute", isAtBase ? "bg-red-500 shadow-md border-2 border-white/40 ring-2 ring-red-600" : "opacity-0", isClickable ? "cursor-pointer animate-pulse ring-4 ring-yellow-400 scale-125 z-20" : "")}></div>
                        </div>
                      )
                   })}
                </div>
                {/* Green Base */}
                <div className={cn("absolute top-[6.6%] right-[6.6%] w-[26.6%] h-[26.6%] bg-white rounded-2xl flex items-center justify-center p-[4%] grid grid-cols-2 grid-rows-2 gap-2 shadow-inner border-4", activeColors.includes('green') ? "border-green-500" : "border-gray-400 opacity-50")}>
                   {activeColors.includes('green') && [0,1,2,3].map(t => {
                      const isAtBase = activeTokens.green[t] === 0;
                      const isClickable = isAtBase && activePhase === 'awaiting_move' && activeTurn === 'green' && gameDoc?.ludoState?.diceValue === 6;
                      return (
                        <div key={t} onClick={() => isClickable && handleTokenClick('green', t)} className="w-full h-full flex items-center justify-center relative">
                           <div className={cn("w-[70%] h-[70%] rounded-full transition-all duration-300 absolute", isAtBase ? "bg-green-500 shadow-md border-2 border-white/40 ring-2 ring-green-600" : "opacity-0", isClickable ? "cursor-pointer animate-pulse ring-4 ring-yellow-400 scale-125 z-20" : "")}></div>
                        </div>
                      )
                   })}
                </div>
                {/* Blue Base */}
                <div className={cn("absolute bottom-[6.6%] left-[6.6%] w-[26.6%] h-[26.6%] bg-white rounded-2xl flex items-center justify-center p-[4%] grid grid-cols-2 grid-rows-2 gap-2 shadow-inner border-4", activeColors.includes('blue') ? "border-blue-500" : "border-gray-400 opacity-50")}>
                   {activeColors.includes('blue') && [0,1,2,3].map(t => {
                      const isAtBase = activeTokens.blue[t] === 0;
                      const isClickable = isAtBase && activePhase === 'awaiting_move' && activeTurn === 'blue' && gameDoc?.ludoState?.diceValue === 6;
                      return (
                        <div key={t} onClick={() => isClickable && handleTokenClick('blue', t)} className="w-full h-full flex items-center justify-center relative">
                           <div className={cn("w-[70%] h-[70%] rounded-full transition-all duration-300 absolute", isAtBase ? "bg-blue-500 shadow-md border-2 border-white/40 ring-2 ring-blue-600" : "opacity-0", isClickable ? "cursor-pointer animate-pulse ring-4 ring-yellow-400 scale-125 z-20" : "")}></div>
                        </div>
                      )
                   })}
                </div>
                {/* Yellow Base */}
                <div className={cn("absolute bottom-[6.6%] right-[6.6%] w-[26.6%] h-[26.6%] bg-white rounded-2xl flex items-center justify-center p-[4%] grid grid-cols-2 grid-rows-2 gap-2 shadow-inner border-4", activeColors.includes('yellow') ? "border-yellow-500" : "border-gray-400 opacity-50")}>
                   {activeColors.includes('yellow') && [0,1,2,3].map(t => {
                      const isAtBase = activeTokens.yellow[t] === 0;
                      const isClickable = isAtBase && activePhase === 'awaiting_move' && activeTurn === 'yellow' && gameDoc?.ludoState?.diceValue === 6;
                      return (
                        <div key={t} onClick={() => isClickable && handleTokenClick('yellow', t)} className="w-full h-full flex items-center justify-center relative">
                           <div className={cn("w-[70%] h-[70%] rounded-full transition-all duration-300 absolute", isAtBase ? "bg-yellow-500 shadow-md border-2 border-white/40 ring-2 ring-yellow-600" : "opacity-0", isClickable ? "cursor-pointer animate-pulse ring-4 ring-yellow-400 scale-125 z-20" : "")}></div>
                        </div>
                      )
                   })}
                </div>
                
                {/* Active Tokens Render on the Path Grid */}
                {activeColors.map((color: string) =>
                   activeTokens[color as keyof typeof activeTokens].map((pos: number, t: number) => {
                      if (pos === 0 || pos > 58) return null; // Already rendered in base or won
                      const coords = getCoordinatesForPosition(color, pos);
                      if (!coords) return null;
                      
                      const isClickable = activePhase === 'awaiting_move' && activeTurn === color && (pos + (gameDoc?.ludoState?.diceValue || 0) <= 58);

                      // Prevent exact overlapping by adding absolute margin shifts based on token index
                      const shiftX = t === 0 ? '-3px' : t === 1 ? '3px' : t === 2 ? '-6px' : '6px';
                      const shiftY = t === 0 ? '-3px' : t === 2 ? '3px' : t === 1 ? '-6px' : '6px';

                      return (
                         <div key={`${color}-${t}`}
                              onClick={() => isClickable && handleTokenClick(color, t)}
                              className={cn(
                                 "absolute w-[6.666%] h-[6.666%] flex items-center justify-center transition-all duration-300",
                                 isClickable ? "cursor-pointer scale-125 z-50 animate-pulse drop-shadow-2xl" : "z-40"
                              )}
                              style={{ 
                                 top: `${coords.r * 6.666}%`, 
                                 left: `${coords.c * 6.666}%`,
                                 marginTop: shiftY,
                                 marginLeft: shiftX
                              }}
                         >
                            <div className={cn(
                               "w-[75%] h-[75%] rounded-full shadow-md border-[1.5px] border-white/60",
                               color === 'red' ? 'bg-red-500' : color === 'green' ? 'bg-green-500' : color === 'yellow' ? 'bg-yellow-500' : 'bg-blue-500',
                               isClickable ? "ring-4 ring-yellow-400" : "ring-1 ring-black/40"
                            )}>
                               <div className="w-full h-full rounded-full border border-black/10"></div>
                            </div>
                         </div>
                      );
                   })
                )}
                
                {/* Center Triangles */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[20%] h-[20%] relative">
                   <div className="absolute inset-0 z-10 w-full h-full" style={{ background: 'conic-gradient(from 45deg, #ef4444 25%, #22c55e 0 50%, #eab308 0 75%, #3b82f6 0)', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}>
                       {/* intersecting lines to make triangles */}
                       <div className="absolute font-black left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white/30 backdrop-blur-sm rounded-full z-20"></div>
                       <svg width="100%" height="100%" className="absolute z-10 opacity-40">
                          <line x1="0" y1="0" x2="100%" y2="100%" stroke="black" strokeWidth="2"/>
                          <line x1="100%" y1="0" x2="0" y2="100%" stroke="black" strokeWidth="2"/>
                       </svg>
                   </div>
                </div>

                {/* --- THE FLOATING 3D DICE --- */}
                <AnimatePresence>
                   {activeTurn && (
                      <motion.div
                        layout
                        onClick={rollDice}
                        initial={false}
                        animate={{
                          // Position based on whose turn it is, or center if rolling/rolled
                          top: diceState !== 'idle' ? '50%' : (activeTurn === 'red' || activeTurn === 'green' ? '19.9%' : '80.1%'),
                          left: diceState !== 'idle' ? '50%' : (activeTurn === 'red' || activeTurn === 'blue' ? '19.9%' : '80.1%'),
                          x: '-50%',
                          y: '-50%',
                          scale: diceState === 'rolling' ? [1, 1.3, 1.6, 1.3, 1] : (diceState === 'rolled' ? 1.2 : 1),
                          rotate: diceState === 'rolling' ? [0, 90, 180, 270, 360] : 0,
                          boxShadow: diceState === 'rolling' ? '0px 15px 30px rgba(0,0,0,0.5)' : '0px 4px 10px rgba(0,0,0,0.4)',
                        }}
                        transition={{
                           duration: diceState === 'rolling' ? 0.8 : 0.4,
                           ease: diceState === 'rolling' ? "easeInOut" : "backOut",
                           times: diceState === 'rolling' ? [0, 0.25, 0.5, 0.75, 1] : undefined
                        }}
                        className={cn(
                           "absolute z-50 w-[12%] h-[12%] bg-gradient-to-b from-white to-gray-200 rounded-xl md:rounded-2xl border-4 cursor-pointer flex items-center justify-center pointer-events-auto",
                           activeTurn === 'red' ? "border-red-500 shadow-red-500/50" : activeTurn === 'green' ? "border-green-500 shadow-green-500/50" : activeTurn === 'blue' ? "border-blue-500 shadow-blue-500/50" : "border-yellow-500 shadow-yellow-500/50",
                           diceState === 'idle' ? "hover:scale-110" : "pointer-events-none"
                        )}
                      >
                          {/* Render Dice Dots based on currentDiceValue */}
                          <div className="relative w-full h-full p-[15%] pointer-events-none">
                             {currentDiceValue === 1 && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[25%] h-[25%] bg-black rounded-full" />}
                             {currentDiceValue === 2 && (
                                <>
                                  <div className="absolute top-[20%] left-[20%] w-[20%] h-[20%] bg-black rounded-full" />
                                  <div className="absolute bottom-[20%] right-[20%] w-[20%] h-[20%] bg-black rounded-full" />
                                </>
                             )}
                             {currentDiceValue === 3 && (
                                <>
                                  <div className="absolute top-[20%] left-[20%] w-[18%] h-[18%] bg-black rounded-full" />
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[18%] h-[18%] bg-black rounded-full" />
                                  <div className="absolute bottom-[20%] right-[20%] w-[18%] h-[18%] bg-black rounded-full" />
                                </>
                             )}
                             {currentDiceValue === 4 && (
                                <>
                                  <div className="absolute top-[20%] left-[20%] w-[20%] h-[20%] bg-black rounded-full" />
                                  <div className="absolute top-[20%] right-[20%] w-[20%] h-[20%] bg-black rounded-full" />
                                  <div className="absolute bottom-[20%] left-[20%] w-[20%] h-[20%] bg-black rounded-full" />
                                  <div className="absolute bottom-[20%] right-[20%] w-[20%] h-[20%] bg-black rounded-full" />
                                </>
                             )}
                             {currentDiceValue === 5 && (
                                <>
                                  <div className="absolute top-[15%] left-[15%] w-[18%] h-[18%] bg-black rounded-full" />
                                  <div className="absolute top-[15%] right-[15%] w-[18%] h-[18%] bg-black rounded-full" />
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[18%] h-[18%] bg-black rounded-full" />
                                  <div className="absolute bottom-[15%] left-[15%] w-[18%] h-[18%] bg-black rounded-full" />
                                  <div className="absolute bottom-[15%] right-[15%] w-[18%] h-[18%] bg-black rounded-full" />
                                </>
                             )}
                             {currentDiceValue === 6 && (
                                <>
                                  <div className="absolute top-[15%] left-[20%] w-[18%] h-[18%] bg-black rounded-full" />
                                  <div className="absolute top-[15%] right-[20%] w-[18%] h-[18%] bg-black rounded-full" />
                                  <div className="absolute top-1/2 left-[20%] -translate-y-1/2 w-[18%] h-[18%] bg-black rounded-full" />
                                  <div className="absolute top-1/2 right-[20%] -translate-y-1/2 w-[18%] h-[18%] bg-black rounded-full" />
                                  <div className="absolute bottom-[15%] left-[20%] w-[18%] h-[18%] bg-black rounded-full" />
                                  <div className="absolute bottom-[15%] right-[20%] w-[18%] h-[18%] bg-black rounded-full" />
                                </>
                             )}
                          </div>
                      </motion.div>
                   )}
                </AnimatePresence>
             </div>
          </div>
       </div>
    </div>
  );
}
