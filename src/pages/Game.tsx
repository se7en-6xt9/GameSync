import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, MessageSquare, Send, RotateCcw, Palette, Users, X, Copy, Check, UserMinus, Trash2 } from 'lucide-react';
import { cn } from '../components/Navbar';
import { useUserStore } from '../store/userStore';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc, query, orderBy, serverTimestamp, where, getDocs, deleteDoc } from 'firebase/firestore';

type Player = 'X' | 'O' | null;
type Theme = 'neon' | 'cyberpunk' | 'classic';

export default function Game() {
  const { mode } = useParams<{ mode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userId, username, activeGameId, setActiveGameId } = useUserStore();
  
  if (!mode || !userId) {
     return <div className="min-h-screen flex items-center justify-center text-white">Loading...</div>;
  }

  const [board, setBoard] = useState<Player[]>(Array(9).fill(null));
  const [currentTurn, setCurrentTurn] = useState<'X' | 'O'>('X');
  const [winner, setWinner] = useState<Player | 'Draw'>(null);
  const [scores, setScores] = useState({ X: 0, O: 0 });
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);

  // Online Multiplayer State
  const [gameId, setGameId] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [mySymbol, setMySymbol] = useState<'X' | 'O'>('X');
  const [opponentName, setOpponentName] = useState<string>('Opponent');
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [boardTheme, setBoardTheme] = useState<Theme>('neon');
  const [difficulty, setDifficulty] = useState<'easy' | 'hard'>('hard');
  const [startingPlayer, setStartingPlayer] = useState<'X' | 'O'>('X');
  const isInitializing = useRef(false);
  const constraintsRef = useRef(null);

  // Messenger logic for Online Mode
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'members'>('chat');
  const [tooltipCopied, setTooltipCopied] = useState(false);

  useEffect(() => {
    if (window !== window.top) {
      const referrer = document.referrer;
      const parentEnv = import.meta.env.VITE_PARENT_ORIGIN || 'melodysync';
      
      if (referrer && referrer.includes(parentEnv.replace('https://', ''))) {
        setIsEmbedded(true);
      }
    }
    
    // Resume flow: if we navigated here, but we already have an active game for this mode
      const initializeGame = async () => {
        if (isInitializing.current) return;
        isInitializing.current = true;
        
        const roomIdFromUrl = searchParams.get('roomId');

        // First, handle Force-Clear if "?clearOld=true"
        if (searchParams.get('clearOld') === 'true') {
           // wipe out uncompleted session for this user + mode explicitly
           try {
             const specificGamesRef = collection(db, 'games');
             const delQuery = query(specificGamesRef, where('players', 'array-contains', userId));
             const snaps = await getDocs(delQuery);
             const promises = snaps.docs
                 .filter(d => {
                   const data = d.data();
                   const checkingOnline = mode === 'online' ? data.mode === 'pvp-online' : data.mode === mode;
                   return checkingOnline && (data.status === 'playing' || data.status === 'waiting');
                 })
                 .map(d => deleteDoc(doc(db, 'games', d.id)));
             await Promise.all(promises);
           } catch(e) {
             console.error("Failed to delete ghosts:", e);
           }
        } else {
          // Check if we are joining a SPECIFIC room (prioritize this over resume)
          if (roomIdFromUrl) {
             const gameDoc = await getDoc(doc(db, 'games', roomIdFromUrl));
             if (gameDoc.exists() && gameDoc.data().mode === 'pvp-online') {
                // If it exists, we skip the normal "reconnect" to old game logic and just enter THIS room
                startOnlineMatch(); 
                return;
             }
          }

          // First, check if we're trying to resume a game by activeGameId
          if (activeGameId) {
          const gameDoc = await getDoc(doc(db, 'games', activeGameId));
          if (gameDoc.exists()) {
             const data = gameDoc.data();
             
             // A function to hydrate the UI state
             const hydrateState = () => {
               setGameId(activeGameId);
               setBoard(data.board || Array(9).fill(null));
               setCurrentTurn(data.currentTurn || 'X');
               setWinner(data.winner || null);
               if (data.scores) setScores(data.scores);
             };
  
             if (mode === 'online' && data.mode === 'pvp-online') {
                hydrateState();
                setMySymbol(data.playerX === userId ? 'X' : 'O');
                setIsWaiting(data.status === 'waiting');
                return;
             } else if (mode === data.mode) {
                hydrateState();
                setMySymbol('X'); // In local/computer, local user is always primarily X
                return;
             }
          }
        }
      }

      // If no valid resume, create new: first guarantee no duplicates left behind 
      if (mode !== 'online') {
         // for computer/local -> Delete any stray sessions first to prevent double-doc creation
         try {
           const specificGamesRef = collection(db, 'games');
           const delQuery = query(specificGamesRef, where('players', 'array-contains', userId));
           const snaps = await getDocs(delQuery);
           const promises = snaps.docs
               .filter(d => d.data().mode === mode && (d.data().status === 'playing' || d.data().status === 'waiting'))
               .map(d => deleteDoc(doc(db, 'games', d.id)));
           await Promise.all(promises);
         } catch(e) {}
      }

      if (mode === 'online') {
        startOnlineMatch();
      } else if (mode === 'local' || mode === 'computer') {
        // Local/AI logic -> Store in DB to enable resume!
        const docRef = await addDoc(collection(db, 'games'), {
          mode: mode,
          status: 'playing',
          playerX: userId,
          playerXName: username,
          playerO: 'computer',
          playerOName: mode === 'computer' ? 'AI' : 'Guest 2',
          players: [userId, 'computer'],
          board: Array(9).fill(null),
          currentTurn: 'X',
          winner: null,
          scores: { X: 0, O: 0 },
          updatedAt: serverTimestamp(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        setGameId(docRef.id);
        setActiveGameId(docRef.id);
        setMySymbol('X');
      }
    };
    
    initializeGame();
  }, [mode]);

  const startOnlineMatch = async () => {
    setIsWaiting(true);
    
    // Explicit Room Join Logic
    const specificRoomId = searchParams.get('roomId');
    if (specificRoomId) {
       const docRef = doc(db, 'games', specificRoomId);
       const snap = await getDoc(docRef);
       if (snap.exists()) {
          const data = snap.data();
          if (data.mode !== 'pvp-online') {
            alert("This is not an online match.");
            navigate('/');
            return;
          }

          // Case 1: We are already in this room (Re-join)
          if (data.players.includes(userId)) {
            setGameId(specificRoomId);
            setActiveGameId(specificRoomId);
            setMySymbol(data.playerX === userId ? 'X' : 'O');
            setIsWaiting(data.status === 'waiting');
            return;
          }

          // Case 2: Room has space for Player O
          if (!data.playerO && data.status === 'waiting') {
            setGameId(specificRoomId);
            setActiveGameId(specificRoomId);
            setMySymbol('O');
            await updateDoc(docRef, {
              status: 'playing',
              playerO: userId,
              playerOName: username,
              players: [data.playerX, userId],
              updatedAt: serverTimestamp(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            setIsWaiting(false);
            return;
          } else {
             // Case 3: Room is full or already playing
             alert("Room is full or game has already started and you are not a participant.");
             navigate('/');
             return;
          }
       } else {
         alert("Invalid Game Code. Room not found.");
         navigate('/');
         return;
       }
    }

    // Attempt reconnect if we dropped mid-game 
    // BUT only if we didn't explicitly request to clearOld
    if (activeGameId && searchParams.get('clearOld') !== 'true') {
      const docRef = doc(db, 'games', activeGameId);
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data().status !== 'finished') {
        const gameData = snap.data();
        if (gameData.playerX === userId || gameData.playerO === userId) {
          setGameId(activeGameId);
          setMySymbol(gameData.playerX === userId ? 'X' : 'O');
          setIsWaiting(gameData.status === 'waiting');
          return;
        }
      }
    }

    // Otherwise find waiting game
    const gamesRef = collection(db, 'games');
    const q = query(gamesRef, where('status', '==', 'waiting'), where('mode', '==', 'pvp-online'));
    const snapshot = await getDocs(q);

    let matchToJoin: any = null;
    snapshot.forEach(doc => {
      if (!matchToJoin && doc.data().playerX !== userId) {
        matchToJoin = { id: doc.id, ...doc.data() };
      }
    });

    if (matchToJoin) {
      // Join existing
      setGameId(matchToJoin.id);
      setActiveGameId(matchToJoin.id);
      setMySymbol('O');
      await updateDoc(doc(db, 'games', matchToJoin.id), {
        status: 'playing',
        playerO: userId,
        playerOName: username,
        players: [matchToJoin.playerX, userId],
        updatedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      setIsWaiting(false);
    } else {
       // Deep copy-prevention logic for online:
       // Before creating a NEW online room, kill any old unjoined waiting/playing rooms of ours
       try {
         const specificGamesRef = collection(db, 'games');
         const delQuery = query(specificGamesRef, where('players', 'array-contains', userId));
         const snaps = await getDocs(delQuery);
         const promises = snaps.docs
             .filter(d => d.data().mode === 'pvp-online' && (d.data().status === 'playing' || d.data().status === 'waiting'))
             .map(d => deleteDoc(doc(db, 'games', d.id)));
         await Promise.all(promises);
       } catch(e) {}
       
      // Create new with 4-Digit Unique ID
      let newCode = "";
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 10) {
         newCode = Math.floor(1000 + Math.random() * 9000).toString();
         const checkSnap = await getDoc(doc(db, 'games', newCode));
         if (!checkSnap.exists()) {
            isUnique = true;
         }
         attempts++;
      }

      if (!isUnique) {
         alert("Failed to generate a room code. Please try again.");
         navigate('/');
         return;
      }

      const docRef = doc(gamesRef, newCode);
      await setDoc(docRef, {
        gameType: 'tictactoe',
        roomId: newCode,
        mode: 'pvp-online',
        status: 'waiting',
        playerX: userId,
        playerXName: username,
        playerO: null,
        playerOName: null,
        players: [userId],
        board: Array(9).fill(null),
        currentTurn: 'X',
        winner: null,
        scores: { X: 0, O: 0 },
        updatedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      setGameId(newCode);
      setActiveGameId(newCode);
      setMySymbol('X');
    }
  };

  useEffect(() => {
    if (!gameId || mode !== 'online') return;

    const unsubGame = onSnapshot(doc(db, 'games', gameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        if (data.status !== 'waiting' && !data.players.includes(userId)) {
           // Wait a bit longer or check if we just joined
           const isJustJoined = activeGameId === gameId;
           if (!isJustJoined) {
              alert("You have been kicked from the room by the Admin.");
              setActiveGameId(null);
              navigate('/');
              return;
           }
        }

        setBoard(data.board);
        setCurrentTurn(data.currentTurn);
        setWinner(data.winner);
        setScores(data.scores);
        if (data.status === 'playing') setIsWaiting(false);
        setOpponentName(mySymbol === 'X' ? data.playerOName || 'Waiting...' : data.playerXName || 'Opponent');
      }
    });

    const messagesRef = collection(db, 'games', gameId, 'chat');
    const qMessages = query(messagesRef, orderBy('timestamp', 'asc'));
    const unsubChat = onSnapshot(qMessages, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubGame();
      unsubChat();
    }
  }, [gameId, mode, mySymbol, userId]);

  const handleKickPlayer = async () => {
    if (gameId && mySymbol === 'X') {
       try {
         await updateDoc(doc(db, 'games', gameId), {
           playerO: null,
           playerOName: null,
           players: [userId], // keep only X
           status: 'waiting',
           board: Array(9).fill(null),
           currentTurn: 'X',
         });
         setIsWaiting(true);
       } catch (e) { console.error('Error kicking:', e); }
    }
  };

  const checkWinner = (squares: Player[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return squares[a];
      }
    }
    if (squares.every(s => s !== null)) return 'Draw';
    return null;
  };

  const minimax = (newBoard: Player[], player: Player): number => {
    const availSpots = newBoard.map((s, i) => s === null ? i : null).filter(s => s !== null);
    
    if (checkWinner(newBoard) === 'X') return -10;
    if (checkWinner(newBoard) === 'O') return 10;
    if (availSpots.length === 0) return 0;

    let moves: { index: number, score: number }[] = [];
    for (let i = 0; i < availSpots.length; i++) {
      let move = { index: availSpots[i] as number, score: 0 };
      newBoard[availSpots[i] as number] = player;

      if (player === 'O') {
        move.score = minimax(newBoard, 'X');
      } else {
        move.score = minimax(newBoard, 'O');
      }

      newBoard[availSpots[i] as number] = null;
      moves.push(move);
    }

    let bestMove = 0;
    if (player === 'O') {
      let bestScore = -10000;
      for (let i = 0; i < moves.length; i++) {
        if (moves[i].score > bestScore) {
          bestScore = moves[i].score;
          bestMove = i;
        }
      }
    } else {
      let bestScore = 10000;
      for (let i = 0; i < moves.length; i++) {
        if (moves[i].score < bestScore) {
          bestScore = moves[i].score;
          bestMove = i;
        }
      }
    }
    return moves[bestMove].score;
  }

  const makeComputerMove = (currBoard: Player[]) => {
    // Check available spots
    const availSpots = currBoard.map((s, i) => s === null ? i : null).filter(s => s !== null) as number[];
    if (availSpots.length === 0) return;

    let moveIdx: number;
    if (difficulty === 'hard') {
      // Use minimax to find the best move
      let bestScore = -Infinity;
      moveIdx = availSpots[0];
      for (const spot of availSpots) {
        const boardCopy = [...currBoard];
        boardCopy[spot] = 'O';
        const score = minimax(boardCopy, 'X');
        if (score > bestScore) {
          bestScore = score;
          moveIdx = spot;
        }
      }
    } else {
      // Easy mode: random move, preferring center
      moveIdx = availSpots.includes(4) ? 4 : availSpots[Math.floor(Math.random() * availSpots.length)];
    }
    
    const newBoard = [...currBoard];
    newBoard[moveIdx] = 'O';
    handleMoveResult(newBoard, 'O');
  };

  const handleMoveResult = async (newBoard: Player[], justPlayed: 'X' | 'O') => {
    const win = checkWinner(newBoard);
    const nextTurn = justPlayed === 'X' ? 'O' : 'X';
    
    setBoard(newBoard);
    setCurrentTurn(nextTurn);
    let updatedScores = { ...scores };

    if (win) {
      setWinner(win);
      if (win === 'X') updatedScores.X += 1;
      if (win === 'O') updatedScores.O += 1;
      setScores(updatedScores);
    }

    if (gameId) {
      updateDoc(doc(db, 'games', gameId), {
        board: newBoard,
        currentTurn: nextTurn,
        winner: win,
        scores: updatedScores,
        updatedAt: serverTimestamp()
      }).catch(e => console.error(e));
    }

    if (mode === 'computer' && !win && justPlayed === 'X') {
       setTimeout(() => makeComputerMove(newBoard), 500);
    }
  };

  const handleSquareClick = (index: number) => {
    if (board[index] || winner || isWaiting) return;
    if (mode === 'online' && currentTurn !== mySymbol) return;

    const newBoard = [...board];
    newBoard[index] = currentTurn;
    handleMoveResult(newBoard, currentTurn);
  };

  const resetBoard = async () => {
    const emptyBoard = Array(9).fill(null);
    const nextToStart = startingPlayer === 'X' ? 'O' : 'X';
    
    setStartingPlayer(nextToStart);
    setBoard(emptyBoard);
    setCurrentTurn(nextToStart);
    setWinner(null);
    
    if (gameId) {
      await updateDoc(doc(db, 'games', gameId), {
        board: emptyBoard,
        currentTurn: nextToStart,
        winner: null,
        updatedAt: serverTimestamp()
      });
    }

    if (mode === 'computer' && nextToStart === 'O') {
      setTimeout(() => makeComputerMove(emptyBoard), 500);
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !gameId) return;
    
    await addDoc(collection(db, 'games', gameId, 'chat'), {
      senderId: userId,
      senderName: username,
      text: chatMessage.trim(),
      timestamp: serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    setChatMessage('');
  };

  const getThemeStyles = () => {
    switch(boardTheme) {
      case 'cyberpunk':
        return {
          bg: 'bg-slate-900',
          border: 'border-cyan-500/30',
          hoverRow: 'hover:bg-fuchsia-900/40 hover:border-fuchsia-500/50',
          xColor: 'text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)] shadow-cyan-500',
          oColor: 'text-fuchsia-500 drop-shadow-[0_0_10px_rgba(217,70,239,0.8)] shadow-fuchsia-500',
          font: 'font-mono tracking-tighter'
        };
      case 'classic':
        return {
          bg: 'bg-white/10',
          border: 'border-white/20',
          hoverRow: 'hover:bg-white/30 hover:border-white/50',
          xColor: 'text-rose-500',
          oColor: 'text-blue-500',
          font: 'font-sans'
        };
      case 'neon':
      default:
        return {
          bg: 'bg-black/20',
          border: 'border-[var(--color-glass-border)]',
          hoverRow: 'hover:bg-purple-500/20 hover:border-purple-400/50 border-transparent',
          xColor: 'text-blue-400 border-blue-500/30 drop-shadow-[0_0_15px_currentColor]',
          oColor: 'text-fuchsia-400 border-fuchsia-500/30 drop-shadow-[0_0_15px_currentColor]',
          font: 'font-black'
        };
    }
  };

  const themeConfig = getThemeStyles();

  const handleCopyCode = () => {
    if (!gameId) return;
    navigator.clipboard.writeText(gameId);
    setTooltipCopied(true);
    setTimeout(() => setTooltipCopied(false), 2000);
  };

  return (
    <div 
      ref={constraintsRef}
      className={cn(
        "w-full max-w-screen-2xl mx-auto h-[100dvh] flex flex-col items-center justify-center gap-2 p-0 sm:p-4 overflow-hidden",
        isEmbedded ? "pt-12" : "pt-24", themeConfig.font
      )}
    >
      
      {/* Main Board Area (Centered) */}
      <div className="w-full flex-1 flex flex-col items-center justify-center min-h-0">
        
        {/* Top Floating Controls */}
        <div className="w-full max-w-[600px] flex justify-between items-center mb-2 sm:mb-4 px-2">
          <div className="flex gap-2">
             <button
               onClick={() => {
                 setActiveGameId(null);
                 navigate('/');
               }}
               className="flex items-center gap-1.5 text-xs sm:text-sm text-purple-200 hover:text-white transition-colors font-medium border border-purple-500/30 rounded-full px-3 py-1.5 bg-[var(--color-glass-surface)] backdrop-blur-sm shadow-[0_0_15px_rgba(255,0,0,0.1)] hover:border-red-400/50 hover:text-red-300"
             >
               <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Exit
             </button>
             {(gameId && (mySymbol === 'X' || mode !== 'online')) && (
                <button
                   onClick={async () => {
                       if (gameId) {
                           try {
                               await deleteDoc(doc(db, 'games', gameId));
                               setActiveGameId(null);
                           } catch(e) {}
                       }
                       navigate('/');
                   }}
                   className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/30 hover:bg-red-500/20 rounded-full px-3 py-1.5 transition-colors"
                >
                   <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
             )}
          </div>
          
          <div className="flex gap-2">
            {mode === 'computer' && (
              <button
                onClick={() => setDifficulty(prev => prev === 'easy' ? 'hard' : 'easy')}
                className={cn(
                  "flex items-center gap-1.5 text-xs sm:text-sm transition-all font-bold border rounded-full px-3 py-1.5",
                  difficulty === 'hard' 
                    ? "text-red-400 border-red-500/30 bg-red-950/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]" 
                    : "text-green-400 border-green-500/30 bg-green-950/20"
                )}
              >
                AI: {difficulty.toUpperCase()}
              </button>
            )}
            
            <button
              onClick={() => setBoardTheme(prev => prev === 'neon' ? 'cyberpunk' : (prev === 'cyberpunk' ? 'classic' : 'neon'))}
              className="flex items-center gap-1.5 text-xs sm:text-sm text-purple-200 hover:text-white transition-colors font-medium border border-purple-500/30 rounded-full px-3 py-1.5 bg-[var(--color-glass-surface)] backdrop-blur-sm hover:bg-purple-500/20"
            >
              <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 
              <span className="capitalize">{boardTheme}</span>
            </button>
          </div>
        </div>

        {/* Maximize the Board UI Container */}
        <div className={cn(
          "w-full max-w-3xl flex flex-col items-center justify-center p-0 lg:p-6 rounded-none lg:rounded-[2.5rem] relative shadow-2xl backdrop-blur-2xl border-x-0 lg:border border-[var(--color-glass-border)] shrink-0",
           boardTheme === 'cyberpunk' ? 'bg-slate-900/80' : 'bg-[var(--color-glass-surface)]'
        )}>
          
          <div className="w-full aspect-square flex items-center justify-center relative my-0 sm:my-2 min-h-0">
            {/* The Actual Grid */}
            <div className="grid grid-cols-3 gap-2 w-full h-full">
              {board.map((cell, idx) => (
                <motion.button
                  key={idx}
                  whileTap={!cell && !winner && (!isWaiting) && (mode !== 'online' || currentTurn === mySymbol) ? { scale: 0.95 } : {}}
                  onClick={() => handleSquareClick(idx)}
                  className={cn(
                    "flex items-center justify-center text-5xl sm:text-7xl lg:text-8xl rounded-xl sm:rounded-2xl shadow-inner transition-colors border-2",
                    themeConfig.bg,
                    themeConfig.border,
                    !cell && !winner ? `${themeConfig.hoverRow} cursor-pointer` : "",
                    cell === 'X' && themeConfig.xColor,
                    cell === 'O' && themeConfig.oColor,
                    (isWaiting || (mode === 'online' && currentTurn !== mySymbol && !winner)) && "opacity-80 cursor-not-allowed"
                  )}
                  disabled={cell !== null || winner !== null || isWaiting || (mode === 'online' && currentTurn !== mySymbol)}
                >
                  <AnimatePresence>
                    {cell && (
                      <motion.span
                        initial={{ scale: 0, rotate: cell === 'X' ? -45 : 45 }}
                        animate={{ scale: 1, rotate: 0 }}
                      >
                        {cell}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              ))}
            </div>
            
            {/* Overlays inside Board Area */}
            <AnimatePresence>
              {winner && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl backdrop-blur-sm z-20"
                >
                  <div className="mb-4 sm:mb-6 px-6 sm:px-8 py-3 sm:py-4 rounded-full bg-white text-purple-900 font-extrabold text-xl sm:text-2xl md:text-3xl shadow-[0_0_30px_rgba(255,255,255,0.8)] text-center w-[90%] break-words">
                    {winner === 'Draw' ? "It's a Draw!" : `${winner} Wins!`}
                  </div>
                  <button
                    onClick={resetBoard}
                    className="flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-bold text-lg sm:text-xl transition-colors shadow-lg hover:shadow-purple-500/50 focus:outline-none"
                  >
                    <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" /> Play Again
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {isWaiting && (
               <div className="absolute inset-0 bg-purple-900/80 backdrop-blur-md flex flex-col items-center justify-center rounded-xl z-20">
                   <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                   <p className="text-xl sm:text-2xl font-bold text-white text-center px-4">Waiting for opponent...</p>
                   {mode === 'online' && gameId && (
                     <div className="mt-4 flex flex-col items-center gap-2">
                       <p className="text-xs sm:text-sm text-purple-200">Share this Room Code:</p>
                       <div className="flex items-center gap-2 bg-black/40 rounded-lg px-4 py-2 border border-purple-500/30">
                          <span className="font-mono text-xl sm:text-2xl font-black tracking-widest text-white">{gameId}</span>
                          <button 
                            onClick={handleCopyCode}
                            disabled={tooltipCopied}
                            className="ml-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-md transition-colors text-white cursor-pointer flex items-center gap-1 shadow-lg pointer-events-auto"
                          >
                            {tooltipCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            <span className="text-sm font-bold">{tooltipCopied ? 'Copied' : 'Copy'}</span>
                          </button>
                       </div>
                     </div>
                   )}
                   <p className="text-xs sm:text-sm text-purple-200/50 mt-6 text-center w-[80%]">Or wait for someone to join randomly.</p>
               </div>
            )}
          </div>
          
          {/* Bottom Score & Name Panel strictly stacked to avoid overlaps */}
          <div className="w-full mt-3 sm:mt-4 flex justify-between items-center px-3 sm:px-6 py-2.5 sm:py-3 bg-black/40 border border-[var(--color-glass-border)] rounded-xl sm:rounded-2xl">
            <div className="flex flex-col items-center flex-1 overflow-hidden">
              <span className="text-[10px] sm:text-xs text-purple-300 font-bold uppercase tracking-wider truncate w-full text-center">
                {mode === 'online' ? (mySymbol === 'X' ? `${username} (X)` : opponentName) : (mode === 'computer' ? username : 'Player 1 (X)')}
              </span>
              <span className={cn("text-2xl sm:text-4xl font-black mt-0.5", themeConfig.xColor.split(' ')[0])}>{scores.X}</span>
            </div>
            
            <div className="flex flex-col items-center justify-center px-2">
              <span className="text-[9px] sm:text-[10px] md:text-xs font-bold tracking-[0.2em] text-white bg-white/10 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full whitespace-nowrap">
                {isWaiting ? 'WAITING...' : (winner ? 'GAME OVER' : `${currentTurn}'s TURN`)}
              </span>
            </div>
            
            <div className="flex flex-col items-center flex-1 overflow-hidden">
              <span className="text-[10px] sm:text-xs text-purple-300 font-bold uppercase tracking-wider truncate w-full text-center">
                 {mode === 'online' ? (mySymbol === 'O' ? `${username} (O)` : opponentName) : (mode === 'computer' ? 'Computer' : 'Player 2 (O)')}
              </span>
              <span className={cn("text-2xl sm:text-4xl font-black mt-0.5", themeConfig.oColor.split(' ')[0])}>{scores.O}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Online Chat Draggable Bubble Logic */}
      {mode === 'online' && (
        <>
          <AnimatePresence>
            {!isChatOpen && (
              <motion.button
                drag
                dragConstraints={constraintsRef}
                dragElastic={0.2}
                dragMomentum={false}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsChatOpen(true)}
                className="fixed bottom-6 right-6 md:bottom-12 md:right-12 w-16 h-16 bg-blue-600 rounded-full shadow-[0_0_20px_rgba(37,99,235,0.6)] flex items-center justify-center z-[110] hover:bg-blue-500 border-2 border-blue-400 group cursor-grab active:cursor-grabbing"
              >
                <MessageSquare className="w-8 h-8 text-white relative z-10" />
                <div className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full border-2 border-[var(--color-background)] animate-pulse" /> 
                {/* Ping red dot can be static or conditionally rendered based on unread rules later */}
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isChatOpen && (
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.9 }}
                transition={{ type: "spring", bounce: 0.3 }}
                className="fixed bottom-6 right-6 md:bottom-12 md:right-12 w-[350px] max-w-[calc(100vw-2rem)] bg-[var(--color-glass-surface)] backdrop-blur-3xl border border-[var(--color-glass-border)] rounded-[2rem] shadow-2xl z-[120] flex flex-col overflow-hidden h-[500px]"
              >
                {/* Header Navbar of Chat box */}
                <div className="p-4 bg-black/40 border-b border-[var(--color-glass-border)] flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChatTab('chat')}
                      className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1", chatTab === 'chat' ? "bg-purple-600 text-white" : "bg-white/10 text-purple-200 hover:bg-white/20")}
                    >
                      <MessageSquare className="w-3 h-3" /> Chat
                    </button>
                    <button
                      onClick={() => setChatTab('members')}
                      className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1", chatTab === 'members' ? "bg-blue-600 text-white" : "bg-white/10 text-blue-200 hover:bg-white/20")}
                    >
                      <Users className="w-3 h-3" /> Players
                    </button>
                  </div>
                  <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-white p-1 bg-black/20 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Tab Views */}
                {chatTab === 'chat' && (
                  <>
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                      {messages.length === 0 && (
                        <p className="text-xs text-center text-purple-300 mt-4">Drop a message or send an emoji!</p>
                      )}
                      {messages.map((msg) => {
                        const isMe = msg.senderId === userId;
                        return (
                          <div key={msg.id} className={cn("flex flex-col max-w-[85%]", isMe ? "self-end items-end" : "self-start items-start")}>
                            <span className="text-[10px] text-purple-300 mb-1 px-1 uppercase">{msg.senderName}</span>
                            <div className={cn(
                              "px-4 py-2 rounded-2xl text-sm break-words max-w-full",
                              isMe ? "bg-purple-600 text-white rounded-br-sm shadow-md" : "bg-white/10 text-white rounded-bl-sm shadow-md"
                            )}>
                              {msg.text}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <form onSubmit={sendChatMessage} className="p-3 border-t border-[var(--color-glass-border)] bg-black/20 flex gap-2">
                      <input
                         type="text"
                         value={chatMessage}
                         onChange={(e) => setChatMessage(e.target.value)}
                         placeholder="Type a message..."
                         className="flex-1 bg-black/30 border border-[var(--color-glass-border)] rounded-full px-4 py-2 text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-purple-400/50"
                      />
                      <button
                        type="submit"
                        disabled={!chatMessage.trim()}
                        className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-full transition-colors flex-shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </>
                )}

                {chatTab === 'members' && (
                  <div className="flex-1 flex flex-col relative p-4 gap-4 overflow-hidden">
                    <div className="flex flex-col gap-2 relative z-10">
                       <h4 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">Connected Players</h4>
                       <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-[var(--color-glass-border)]">
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-black text-white">X</div>
                          <span className="font-medium text-white">{mySymbol === 'X' ? `${username} (You)` : opponentName}</span>
                       </div>
                       <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-[var(--color-glass-border)]">
                          <div className="w-8 h-8 rounded-full bg-fuchsia-500 flex items-center justify-center font-black text-white">O</div>
                          <span className="font-medium text-white flex-1 truncate">
                             {isWaiting ? <span className="text-fuchsia-300 italic text-sm">Waiting...</span> : (mySymbol === 'O' ? `${username} (You)` : opponentName)}
                          </span>
                          {!isWaiting && mySymbol === 'X' && (
                             <button
                               onClick={handleKickPlayer}
                               title="Kick Player"
                               className="p-1.5 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-md transition-colors"
                             >
                               <UserMinus className="w-4 h-4" />
                             </button>
                          )}
                       </div>
                    </div>
                    
                    <div className="mt-auto items-center justify-items-center w-full flex flex-col p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl relative z-10">
                      <h4 className="text-xs text-blue-300 font-bold uppercase tracking-wider mb-2">Room Code (Friends can join)</h4>
                      <div className="flex items-center gap-2 bg-black/40 rounded-lg p-2 w-full justify-between">
                         <span className="font-mono text-sm tracking-wide text-white truncate px-2">{gameId}</span>
                         <button 
                           onClick={handleCopyCode}
                           disabled={tooltipCopied}
                           className="p-1.5 hover:bg-white/20 rounded-md transition-colors text-blue-300 cursor-pointer"
                         >
                           {tooltipCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                         </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
