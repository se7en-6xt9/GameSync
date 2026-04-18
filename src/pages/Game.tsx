import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, MessageSquare, Send, RotateCcw } from 'lucide-react';
import { cn } from '../components/Navbar';
import { useUserStore } from '../store/userStore';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc, query, orderBy, serverTimestamp, where, getDocs } from 'firebase/firestore';

type Player = 'X' | 'O' | null;

export default function Game() {
  const { mode } = useParams<{ mode: string }>();
  const navigate = useNavigate();
  const { userId, username, activeGameId, setActiveGameId } = useUserStore();

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

  useEffect(() => {
    if (mode === 'online') {
      startOnlineMatch();
    } else if (mode === 'local' || mode === 'computer') {
      resetBoard();
      setActiveGameId(null);
    }
    // Cleanup if leaving
    return () => {
      // Could handle leaving match logic if needed
    };
  }, [mode]);

  const startOnlineMatch = async () => {
    setIsWaiting(true);
    
    // Attempt reconnect if we dropped mid-game
    if (activeGameId) {
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
        updatedAt: serverTimestamp()
      });
      setIsWaiting(false);
    } else {
      // Create new
      const docRef = await addDoc(gamesRef, {
        mode: 'pvp-online',
        status: 'waiting',
        playerX: userId,
        playerXName: username,
        playerO: null,
        playerOName: null,
        board: Array(9).fill(null),
        currentTurn: 'X',
        winner: null,
        scores: { X: 0, O: 0 },
        updatedAt: serverTimestamp()
      });
      setGameId(docRef.id);
      setActiveGameId(docRef.id);
      setMySymbol('X');
    }
  };

  useEffect(() => {
    if (!gameId || mode !== 'online') return;

    const unsubGame = onSnapshot(doc(db, 'games', gameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
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
  }, [gameId, mode, mySymbol]);

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
    const availSpots = currBoard.map((s, i) => s === null ? i : null).filter(s => s !== null);
    if (availSpots.length === 0) return;

    // Simple AI for now - get random or middle
    let moveIdx = availSpots.includes(4) ? 4 : availSpots[Math.floor(Math.random() * availSpots.length)] as number;
    
    // Attempt min-max if you want it unbeatable, but random/simple is fine for standard.
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

    if (mode === 'online' && gameId) {
      await updateDoc(doc(db, 'games', gameId), {
        board: newBoard,
        currentTurn: nextTurn,
        winner: win,
        scores: updatedScores,
        updatedAt: serverTimestamp()
      });
    } else if (mode === 'computer' && !win && justPlayed === 'X') {
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
    setBoard(emptyBoard);
    setCurrentTurn('X');
    setWinner(null);
    if (mode === 'online' && gameId) {
      await updateDoc(doc(db, 'games', gameId), {
        board: emptyBoard,
        currentTurn: 'X',
        winner: null,
        updatedAt: serverTimestamp()
      });
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !gameId) return;
    
    await addDoc(collection(db, 'games', gameId, 'chat'), {
      senderId: userId,
      senderName: username,
      text: chatMessage.trim(),
      timestamp: serverTimestamp()
    });
    setChatMessage('');
  };

  return (
    <div className="pt-24 pb-8 px-4 max-w-7xl mx-auto min-h-screen flex flex-col md:flex-row gap-8">
      <div className="flex-1 flex flex-col">
        <button
          onClick={() => navigate('/')}
          className="self-start flex items-center gap-2 text-purple-200 hover:text-white mb-6 transition-colors font-medium border border-purple-500/30 rounded-full px-4 py-2 bg-[var(--color-glass-surface)] backdrop-blur-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Modes
        </button>

        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--color-glass-surface)] backdrop-blur-xl border border-[var(--color-glass-border)] rounded-[2rem] relative overflow-hidden shadow-2xl">
          {/* Header Stats */}
          <div className="absolute top-0 w-full flex justify-between px-8 py-6 bg-purple-900/50 border-b border-[var(--color-glass-border)]">
            <div className="flex flex-col items-center">
              <span className="text-sm text-purple-300 font-bold uppercase tracking-wider">
                {mode === 'online' ? (mySymbol === 'X' ? username : opponentName) : (mode === 'computer' ? username : 'Player 1 (X)')}
              </span>
              <span className="text-3xl font-black bg-gradient-to-t from-blue-400 to-blue-200 bg-clip-text text-transparent">{scores.X}</span>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="text-sm text-purple-400 font-bold tracking-widest">{isWaiting ? 'WAITING FOR OPPONENT' : (winner ? 'GAME OVER' : `${currentTurn}'s TURN`)}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-sm text-purple-300 font-bold uppercase tracking-wider">
                 {mode === 'online' ? (mySymbol === 'O' ? username : opponentName) : (mode === 'computer' ? 'Computer' : 'Player 2 (O)')}
              </span>
              <span className="text-3xl font-black bg-gradient-to-t from-purple-400 to-fuchsia-200 bg-clip-text text-transparent">{scores.O}</span>
            </div>
          </div>

          {/* Board */}
          <div className="mt-16 grid grid-cols-3 gap-3 md:gap-4 w-full max-w-[400px] aspect-square">
            {board.map((cell, idx) => (
              <motion.button
                key={idx}
                whileTap={!cell && !winner && (!isWaiting) && (mode !== 'online' || currentTurn === mySymbol) ? { scale: 0.95 } : {}}
                onClick={() => handleSquareClick(idx)}
                className={cn(
                  "flex items-center justify-center text-4xl md:text-6xl font-black rounded-2xl shadow-inner transition-all",
                  "bg-black/20 border-2",
                  !cell && !winner ? "hover:bg-purple-500/20 hover:border-purple-400/50 cursor-pointer border-transparent" : "border-[var(--color-glass-border)]",
                  cell === 'X' && "text-blue-400 border-blue-500/30",
                  cell === 'O' && "text-fuchsia-400 border-fuchsia-500/30",
                  (isWaiting || (mode === 'online' && currentTurn !== mySymbol && !winner)) && "opacity-80 cursor-not-allowed"
                )}
                disabled={cell !== null || winner !== null || isWaiting || (mode === 'online' && currentTurn !== mySymbol)}
              >
                <AnimatePresence>
                  {cell && (
                    <motion.span
                      initial={{ scale: 0, rotate: cell === 'X' ? -45 : 45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      className="drop-shadow-[0_0_15px_currentColor]"
                    >
                      {cell}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>

          <AnimatePresence>
            {winner && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-4"
              >
                <div className="px-6 py-2 rounded-full bg-white text-purple-900 font-bold text-lg shadow-[0_0_20px_rgba(255,255,255,0.5)]">
                  {winner === 'Draw' ? "It's a Draw!" : `${winner} Wins!`}
                </div>
                <button
                  onClick={resetBoard}
                  className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-bold transition-colors shadow-lg"
                >
                  <RotateCcw className="w-5 h-5" /> Play Again
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {isWaiting && (
             <div className="absolute inset-0 bg-purple-900/80 backdrop-blur-sm flex flex-col items-center justify-center">
                 <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                 <p className="text-xl font-bold">Waiting for opponent...</p>
                 <p className="text-sm text-purple-300 mt-2">Send URL or wait for a random match.</p>
             </div>
          )}
        </div>
      </div>

      {mode === 'online' && (
        <div className="w-full md:w-80 flex flex-col bg-[var(--color-glass-surface)] backdrop-blur-xl border border-[var(--color-glass-border)] rounded-[2rem] overflow-hidden shadow-2xl h-[500px] md:h-auto">
          <div className="p-4 bg-black/20 border-b border-[var(--color-glass-border)] flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-purple-300" />
            <span className="font-bold">Match Chat</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {messages.map((msg) => {
              const isMe = msg.senderId === userId;
              return (
                <div key={msg.id} className={cn("flex flex-col max-w-[85%]", isMe ? "self-end items-end" : "self-start items-start")}>
                  <span className="text-[10px] text-purple-300 mb-1 px-1 uppercase">{msg.senderName}</span>
                  <div className={cn(
                    "px-4 py-2 rounded-2xl text-sm",
                    isMe ? "bg-purple-500 text-white rounded-br-sm" : "bg-white/10 text-white rounded-bl-sm"
                  )}>
                    {msg.text}
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={sendChatMessage} className="p-4 border-t border-[var(--color-glass-border)] bg-black/10 flex gap-2">
            <input
               type="text"
               value={chatMessage}
               onChange={(e) => setChatMessage(e.target.value)}
               placeholder="Type a message..."
               className="flex-1 bg-black/20 border border-[var(--color-glass-border)] rounded-full px-4 py-2 text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-purple-400"
            />
            <button
              type="submit"
              disabled={!chatMessage.trim()}
              className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-full transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
