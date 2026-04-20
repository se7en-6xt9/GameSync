import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, MessageSquare, Send, RotateCcw, Palette, Users, X, Copy, Check, UserMinus, Crown, Shield, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '../components/Navbar';
import { useUserStore } from '../store/userStore';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, updateDoc, collection, query, orderBy, serverTimestamp, getDoc, getDocs, where, deleteDoc, addDoc } from 'firebase/firestore';

import { Chess } from 'chess.js';

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: any;
};

type ChessMove = {
  san: string;
  color: string;
  from: string;
  to: string;
};

// URL mapping for standard chess pieces
const PIECE_IMAGES: Record<string, string> = {
  'p_w': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
  'n_w': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
  'b_w': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
  'r_w': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
  'q_w': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
  'k_w': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
  'p_b': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
  'n_b': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
  'b_b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
  'r_b': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
  'q_b': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
  'k_b': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
};

type Theme = 'cyberpunk' | 'classic' | 'neon' | 'original';

// --- SLIDING ANIMATION ENGINE ---
const getInitialPieces = () => {
  const p: { id: string, type: string, color: string, square: string }[] = [];
  ['a','b','c','d','e','f','g','h'].forEach((file) => {
     p.push({ id: `p_${file}2`, type: 'p', color: 'w', square: `${file}2` });
     p.push({ id: `p_${file}7`, type: 'p', color: 'b', square: `${file}7` });
  });
  const order = ['r','n','b','q','k','b','n','r'];
  order.forEach((type, i) => {
     const file = String.fromCharCode(97 + i);
     // 1 for White, 8 for Black (kings and queens are stable, but we append file to differentiate rooks/knights)
     p.push({ id: `${type}_${file}1`, type, color: 'w', square: `${file}1` });
     p.push({ id: `${type}_${file}8`, type, color: 'b', square: `${file}8` });
  });
  return p;
};

export default function ChessGame() {
  const { mode } = useParams<{ mode: string }>(); // 'local' | 'online' | 'computer'
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const { userId, username, activeGameId, setActiveGameId } = useUserStore();
  
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [history, setHistory] = useState<ChessMove[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  
  const [isWaiting, setIsWaiting] = useState(false);
  const [mySymbol, setMySymbol] = useState<'w' | 'b'>('w');
  const [opponentName, setOpponentName] = useState<string>('Opponent');
  const [statusText, setStatusText] = useState('White to move');
  const [isEmbedded, setIsEmbedded] = useState(false);
  
  const [isInitializingGame, setIsInitializingGame] = useState(true);
  const [boardTheme, setBoardTheme] = useState<Theme>('original');
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const isInitializing = useRef(false);
  const constraintsRef = useRef(null);
  
  // Game Customizations
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);
  const [showGameOverModal, setShowGameOverModal] = useState(true);

  // Messenger logic for Online Mode
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'players'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [tooltipCopied, setTooltipCopied] = useState(false);

  // AI Logic
  const [difficulty, setDifficulty] = useState<number>(3); // 1-8, 9 is Grandmaster
  const stockfish = useRef<Worker | null>(null);
  const aiThinkingRef = useRef<boolean>(false);
  const [isGameStarted, setIsGameStarted] = useState(false);

  useEffect(() => {
    if (window !== window.top) {
      setIsEmbedded(true);
    }
  }, []);

  // Hardware Back Button to Close Modal
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isRestartModalOpen) {
        setIsRestartModalOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isRestartModalOpen]);

  const openRestartModal = () => {
    window.history.pushState({ modal: 'restart' }, '');
    setIsRestartModalOpen(true);
  };
  
  const closeRestartModal = () => {
    if (window.history.state?.modal === 'restart') {
      window.history.back();
    } else {
      setIsRestartModalOpen(false);
    }
  };

  const [animatedPieces, setAnimatedPieces] = useState<{ id: string, type: string, color: string, square: string }[]>(getInitialPieces());

  useEffect(() => {
     let pieces = getInitialPieces();
     const moves = game.history({ verbose: true }) as any[];
     if (moves.length === 0 && fen !== new Chess().fen()) {
         // Loaded from a raw FEN without history! Generate directly from board manually.
         const boardFallback: typeof pieces = [];
         const b = game.board();
         const files = ['a','b','c','d','e','f','g','h'];
         const ranks = ['8','7','6','5','4','3','2','1'];
         for (let r=0; r<8; r++) {
             for (let f=0; f<8; f++) {
                  if (b[r][f]) {
                       boardFallback.push({
                           id: `fb_${files[f]}${ranks[r]}`,
                           type: b[r][f]!.type,
                           color: b[r][f]!.color,
                           square: `${files[f]}${ranks[r]}`
                       });
                  }
             }
         }
         pieces = boardFallback;
     } else {
         for (const move of moves) {
            if (move.captured) {
               let capSquare = move.to;
               if (move.flags && move.flags.includes('e')) {
                  capSquare = move.to[0] + move.from[1]; 
               }
               pieces = pieces.filter(p => !(p.square === capSquare && p.color !== move.color));
            }
            
            const pIdx = pieces.findIndex(p => p.square === move.from);
            if (pIdx > -1) {
               pieces[pIdx] = { ...pieces[pIdx], square: move.to };
               if (move.promotion) {
                  pieces[pIdx].type = move.promotion;
               }
            }
            
            if (move.flags && (move.flags.includes('k') || move.flags.includes('q'))) {
               const rank = move.color === 'w' ? '1' : '8';
               const rookFromFile = move.flags.includes('k') ? 'h' : 'a';
               const rookToFile = move.flags.includes('k') ? 'f' : 'd';
               const rIdx = pieces.findIndex(p => p.square === `${rookFromFile}${rank}` && p.type === 'r');
               if (rIdx > -1) {
                  pieces[rIdx] = { ...pieces[rIdx], square: `${rookToFile}${rank}` };
               }
            }
         }
     }
     setAnimatedPieces(pieces);
  }, [fen, game]); // Run whenever fen changes so it rebuilds the exact piece stable mapped state automatically!

  // Initialize Audio
  const playSound = (type: 'move' | 'capture' | 'victory') => {
    if (!isSoundEnabled) return;
    try {
      const audio = new Audio();
      if (type === 'move') audio.src = 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3';
      else if (type === 'capture') audio.src = 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3';
      else if (type === 'victory') audio.src = 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3';
      audio.play().catch(() => {});
    } catch (e) {}
  };

  // Stockfish Init with CORS workaround
  useEffect(() => {
    if (mode === 'computer' && !stockfish.current) {
       const loadStockfish = async () => {
         try {
           const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.0/stockfish.js');
           const code = await response.text();
           const blob = new Blob([code], { type: 'application/javascript' });
           const workerUrl = URL.createObjectURL(blob);
           
           stockfish.current = new Worker(workerUrl);
           stockfish.current.postMessage('uci');
           console.log("Stockfish Worker loaded successfully via Blob URL");
         } catch (e) {
           console.error("Failed to load Stockfish worker via Blob:", e);
         }
       };
       
       loadStockfish();
    }
    return () => {
       if (stockfish.current) {
          stockfish.current.terminate();
          stockfish.current = null;
       }
    };
  }, [mode]);

  useEffect(() => {
     if (mode === 'computer' && stockfish.current && isGameStarted && game.turn() !== mySymbol && !game.isGameOver()) {
        // Double-check we aren't already computing a move
        if (aiThinkingRef.current) return;
        aiThinkingRef.current = true;

        // Evaluate based on difficulty
        const depth = difficulty === 9 ? 15 : Math.max(1, difficulty);
        const skill = difficulty === 9 ? 20 : difficulty * 2;
        
        stockfish.current.postMessage(`setoption name Skill Level value ${skill}`);
        stockfish.current.postMessage(`position fen ${game.fen()}`);
        stockfish.current.postMessage(`go depth ${depth}`);
        
        const aiThinkTime = 1000 + Math.random() * 500; // Minimum 1 second for natural feel
        const startTime = Date.now();
        
        stockfish.current.onmessage = (e) => {
           if (e.data && e.data.includes('bestmove')) {
              const move = e.data.split(' ')[1];
              
              const elapsed = Date.now() - startTime;
              const delay = Math.max(0, aiThinkTime - elapsed);
              
              setTimeout(() => {
                 // Final safety check: is it still the AI's turn after the delay?
                 if (game.turn() !== mySymbol && !game.isGameOver()) {
                    makeMove(move, true);
                 }
                 aiThinkingRef.current = false;
              }, delay);
           }
        };
     }
  }, [fen, mySymbol, mode, difficulty, game, isGameStarted]);


  // Firebase initialization logic
  useEffect(() => {
    // If userId not ready or already initializing, wait.
    if (!userId || isInitializing.current) {
        // However, if we've been "initializing" for a while and gameId is set, 
        // we might have already finished.
        if (gameId) setIsInitializingGame(false);
        return;
    }

    const initializeGame = async () => {
      isInitializing.current = true;
      setIsInitializingGame(true);
      console.log("Starting Chess Initialization:", { mode, userId, activeGameId });

      try {
        // Clear if requested
        if (activeGameId && searchParams.get('clearOld') === 'true') {
           try { await deleteDoc(doc(db, 'games', activeGameId)); } catch(e) {}
           setActiveGameId(null);
        }

        // Resume if exists
        if (activeGameId && searchParams.get('clearOld') !== 'true') {
          const docRef = doc(db, 'games', activeGameId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const gameData = snap.data();
            if (gameData.status !== 'finished' && (gameData.playerX === userId || gameData.playerO === userId)) {
              setGameId(activeGameId);
              setMySymbol(gameData.playerX === userId ? 'w' : 'b');
              setIsWaiting(gameData.status === 'waiting');
              
              const resGame = new Chess();
              if (gameData.fen && gameData.fen !== 'start') resGame.load(gameData.fen);
              setGame(resGame);
              setFen(resGame.fen());
              
              setIsInitializingGame(false);
              return;
            }
          }
        }

        // Clean up other same-mode games for local/computer
        if (mode !== 'online') {
           try {
             const specificGamesRef = collection(db, 'games');
             const delQuery = query(specificGamesRef, where('players', 'array-contains', userId));
             const snaps = await getDocs(delQuery);
             const promises = snaps.docs
                 .filter(d => {
                     const data = d.data();
                     return data.mode === mode && data.gameType === 'chess' && d.id !== activeGameId;
                 })
                 .map(d => deleteDoc(doc(db, 'games', d.id)));
             await Promise.all(promises);
           } catch(e) {
             console.warn("Cleanup warning:", e);
           }
        }

        // Create new session
        if (mode === 'online') {
          await startOnlineMatch();
        } else {
          // Local or Computer
          setIsWaiting(false); // FORCIBLY CLEAR WAITING IMMEDIATELY BEFORE ANY NETWORK CALL!
          setMySymbol('w');

          // Try to persist it, but do not await! So game is instantly playable even if network holds it up.
          addDoc(collection(db, 'games'), {
            gameType: 'chess',
            mode: mode,
            status: 'playing',
            playerX: userId,
            playerXName: username || 'Guest',
            playerO: mode === 'computer' ? 'computer' : null,
            playerOName: mode === 'computer' ? 'AI' : (mode === 'local' ? 'Guest 2' : 'Opponent'),
            players: mode === 'computer' ? [userId, 'computer'] : [userId],
            hostColor: 'w',
            fen: 'start',
            history: [],
            turn: 'w',
            currentTurn: 'X',
            winner: null,
            scores: { X: 0, O: 0 },
            updatedAt: serverTimestamp(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }).then(docRef => {
            setGameId(docRef.id);
            setActiveGameId(docRef.id);
          }).catch(console.error);
        }
      } catch (err) {
        console.error("Game init error:", err);
      } finally {
        setIsInitializingGame(false);
      }
    };
    
    initializeGame();
  }, [mode, userId, username, searchParams, activeGameId, setActiveGameId]);

  const startOnlineMatch = async () => {
    setIsWaiting(true);
    
    const specificRoomId = searchParams.get('roomId');
    if (specificRoomId) {
       const docRef = doc(db, 'games', specificRoomId);
       const snap = await getDoc(docRef);
       if (snap.exists()) {
          const data = snap.data();
          if (data.mode !== 'pvp-online' || data.gameType !== 'chess') {
            alert("This is not a valid Chess online match.");
            navigate('/');
            return;
          }

          if (data.players.includes(userId)) {
            setGameId(specificRoomId);
            setActiveGameId(specificRoomId);
            setMySymbol(data.playerX === userId ? 'w' : 'b');
            setIsWaiting(data.status === 'waiting');
            return;
          }

          if (!data.playerO && data.status === 'waiting') {
            setGameId(specificRoomId);
            setActiveGameId(specificRoomId);
            setMySymbol('b');
            await updateDoc(docRef, {
              status: 'playing',
              playerO: userId,
              playerOName: username,
              players: [data.playerX, userId],
              updatedAt: serverTimestamp()
            });
            setIsWaiting(false);
            return;
          } else {
             alert("Room is full or game has already started.");
             navigate('/');
             return;
          }
       } else {
         alert("Invalid Game Code. Room not found.");
         navigate('/');
         return;
       }
    }

    if (activeGameId && searchParams.get('clearOld') !== 'true') {
      const docRef = doc(db, 'games', activeGameId);
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data().status !== 'finished') {
        const gameData = snap.data();
        if (gameData.playerX === userId || gameData.playerO === userId) {
          setGameId(activeGameId);
          setMySymbol(gameData.playerX === userId ? 'w' : 'b');
          setIsWaiting(gameData.status === 'waiting');
          return;
        }
      }
    }

    const gamesRef = collection(db, 'games');
    const q = query(gamesRef, where('status', '==', 'waiting'), where('mode', '==', 'pvp-online'), where('gameType', '==', 'chess'));
    const snapshot = await getDocs(q);

    let matchToJoin: any = null;
    snapshot.forEach(doc => {
      if (!matchToJoin && doc.data().playerX !== userId) {
        matchToJoin = { id: doc.id, ...doc.data() };
      }
    });

    if (matchToJoin) {
      setGameId(matchToJoin.id);
      setActiveGameId(matchToJoin.id);
      setMySymbol('b');
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
       try {
         const specificGamesRef = collection(db, 'games');
         const delQuery = query(specificGamesRef, where('players', 'array-contains', userId));
         const snaps = await getDocs(delQuery);
         const promises = snaps.docs
             .filter(d => d.data().mode === 'pvp-online' && d.data().gameType === 'chess' && (d.data().status === 'playing' || d.data().status === 'waiting'))
             .map(d => deleteDoc(doc(db, 'games', d.id)));
         await Promise.all(promises);
       } catch(e) {}
       
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
        gameType: 'chess',
        mode: 'pvp-online',
        status: 'waiting',
        playerX: userId,
        playerXName: username,
        playerO: null,
        playerOName: null,
        players: [userId],
        hostColor: 'w',
        fen: 'start',
        history: [],
        turn: 'w',
        currentTurn: 'X', // compatibility
        winner: null,
        scores: { X: 0, O: 0 },
        updatedAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
      setGameId(newCode);
      setActiveGameId(newCode);
      setMySymbol('w');
    }
  };

  useEffect(() => {
    if (!gameId) return;

    const unsubGame = onSnapshot(doc(db, 'games', gameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // --- STABILITY GUARD ---
        // We only apply the snapshot if it actually has MORE moves than we do locally,
        // or if it's the very first load. This prevents 'undo' flickering.
        const serverHistory = data.history || [];
        const localHistoryCount = game.history().length;
        
        if (serverHistory.length < localHistoryCount && !docSnap.metadata.hasPendingWrites) {
            // Server is behind us and we don't even have pending writes? 
            // This is likely a stale snapshot. Stop.
            return;
        }

        // Dynamically update symbol and names
        if (mode === 'online' && !data.players.includes(userId)) {
           alert("You have been kicked from the room by the Admin.");
           setActiveGameId(null);
           navigate('/');
           return;
        }

        // Use hostColor instead of physically swapping playerX and playerO to prevent Name Swapping issues
        if (data.playerX === userId) {
            setMySymbol(data.hostColor === 'b' ? 'b' : 'w');
            setOpponentName(data.playerOName || (mode === 'computer' ? 'AI' : 'Opponent'));
        } else if (data.playerO === userId) {
            setMySymbol(data.hostColor === 'b' ? 'w' : 'b'); // The other person gets opposite of hostColor
            setOpponentName(data.playerXName || 'Opponent');
        } else {
            // Local fallback
            if (mode === 'local') setOpponentName('Guest 2');
        }

        const newGame = new Chess();
        if (data.history && data.history.length > 0) {
           for (const m of data.history) {
              try { newGame.move(m); } catch(e) {}
           }
        } else if (data.fen && data.fen !== 'start') {
           newGame.load(data.fen);
        }
        setGame(newGame);
        setFen(newGame.fen());
        
        // Handle conversion if history contains strings (compatibility)
        const rawHistory = data.history || [];
        const normalizedHistory: ChessMove[] = rawHistory.map((m: any) => {
           if (typeof m === 'string') {
              // This is a minimal conversion, but ideally we want objects.
              // Since we're rebuilding the game anyway, we could re-derive verbose history
              return { san: m, color: '?', from: '?', to: '?' };
           }
           return m as ChessMove;
        });

        // Actually, the most reliable way to get verbose history after loading a FEN/moves is:
        const verboseHistory = newGame.history({ verbose: true }) as any as ChessMove[];
        setHistory(verboseHistory.length > 0 ? verboseHistory : normalizedHistory);
        
        if (newGame.isGameOver()) {
            setShowGameOverModal(true);
            let winText = "Draw!";
            if (newGame.isCheckmate()) {
                winText = `${newGame.turn() === 'w' ? 'Black' : 'White'} wins by Checkmate!`;
                if(data.winner === null) playSound('victory');
            }
            setStatusText(winText);
        } else {
            setStatusText(newGame.turn() === 'w' ? "White's turn" : "Black's turn");
        }

        if (data.status === 'playing') setIsWaiting(false);
        setOpponentName(mySymbol === 'w' ? data.playerOName || 'Waiting...' : data.playerXName || 'Opponent');
      }
    });

    let unsubChat = () => {};
    if (mode === 'online') {
       const messagesRef = collection(db, 'games', gameId, 'chat');
       const qMessages = query(messagesRef, orderBy('timestamp', 'asc'));
       unsubChat = onSnapshot(qMessages, (snap) => {
         setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
       });
    }

    return () => {
      unsubGame();
      unsubChat();
    }
  }, [gameId, mode, mySymbol, userId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages, isChatOpen, chatTab]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !gameId) return;

    const messageText = newMessage;
    setNewMessage('');
    try {
      await addDoc(collection(db, 'games', gameId, 'chat'), {
        senderId: userId,
        senderName: username,
        text: messageText,
        timestamp: serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });
    } catch(err) { console.error('Error sending message:', err) }
  };

  const handleKickPlayer = async () => {
    if (gameId && mySymbol === 'w') {
       try {
         await updateDoc(doc(db, 'games', gameId), {
           playerO: null,
           playerOName: null,
           players: [userId], 
           status: 'waiting',
           fen: 'start',
           turn: 'w',
         });
         setIsWaiting(true);
       } catch (e) { console.error('Error kicking:', e); }
    }
  };

  const makeMove = useCallback(async (moveVal: string | {from: string, to: string, promotion?: string}, isComputer = false) => {
     if (game.isGameOver() || isWaiting) return false;
     
     // Require explicitly starting the game in Computer mode
     if (mode === 'computer' && !isGameStarted) return false;
     
     // Allow local mode to accept any turn. Computer/Online restrict to mySymbol.
     if (!isComputer && mode !== 'local' && game.turn() !== mySymbol) {
         return false;
     }

     const gameCopy = new Chess();
     if (game.history().length === 0 && game.fen() !== new Chess().fen()) {
         gameCopy.load(game.fen());
     } else {
         game.history().forEach(m => gameCopy.move(m));
     }
     
     let moveData = null;
     
     // SMART MOVE ENGINE:
     // If moveVal is object, we safely strip promotion first, and then add it if needed.
     // Some chess.js versions reject clean moves if they contain 'promotion: q' when not on 8th rank.
     // Some return 'null', some throw Error.
     if (typeof moveVal === 'object') {
         const nakedMove = { from: moveVal.from, to: moveVal.to };
         const promoMove = { from: moveVal.from, to: moveVal.to, promotion: moveVal.promotion || 'q' };
         
         try {
             // 1st Try: Naked move (no promotion)
             moveData = gameCopy.move(nakedMove);
         } catch (e) {
             // Suppress
         }
         
         // 2nd Try: If naked failed or returned null, try with promotion
         if (!moveData) {
              try {
                  moveData = gameCopy.move(promoMove);
              } catch(e) {
                  // Suppress
              }
         }
     } else {
         // SAN or LAN string
         try { moveData = gameCopy.move(moveVal); } catch(e) {}
     }
     
     if (!moveData) return false; // Absolutely invalid move
       
     setGame(gameCopy);
     setFen(gameCopy.fen());
     
     if (moveData.captured) playSound('capture');
     else playSound('move');

     if (gameCopy.isGameOver()) playSound('victory');

     if (gameId) {
        const newHistory = gameCopy.history({ verbose: true }) as any as ChessMove[];
        setHistory(newHistory);
        // Fire and forget Firestore update
        updateDoc(doc(db, 'games', gameId), {
           fen: gameCopy.fen(),
           turn: gameCopy.turn(),
           history: newHistory,
           updatedAt: serverTimestamp()
        }).catch(e => console.error("Firebase sync error:", e));
     }

     return true;
  }, [game, isWaiting, mySymbol, gameId, mode, isGameStarted]);

  const getMoveOptions = (square: string) => {
    const piece = game.get(square as any);
    if (!piece || (mode !== 'local' && piece.color !== mySymbol)) {
       setOptionSquares({});
       return false;
    }

    const moves = game.moves({
      square: square as any,
      verbose: true,
    });
    
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: Record<string, React.CSSProperties> = {};
    moves.forEach((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to as any)
            ? 'rgba(239, 68, 68, 0.7)' // Solid red hint for captures
            : 'rgba(56, 189, 248, 0.5)', // Solid bright blue hint for normal moves
        borderRadius: '50%',
        transform: game.get(move.to as any) ? 'scale(0.8)' : 'scale(0.35)', // Nice circles
      };
    });
    newSquares[square] = {
      background: 'rgba(250, 204, 21, 0.6)', // Selected piece yellow
      borderRadius: '20%',
    };
    setOptionSquares(newSquares);
    return true;
  };

  const onSquareClick = async (square: string) => {
    // 1. If we are currently selecting a square
    if (!moveFrom) {
      const hasOptions = getMoveOptions(square);
      if (hasOptions) setMoveFrom(square);
      return;
    }

    // 2. If we already have a square selected, try making a move
    const moveResult = await makeMove({
      from: moveFrom,
      to: square,
      promotion: 'q',
    });

    // 3. If move successful, reset
    if (moveResult) {
      setMoveFrom(null);
      setOptionSquares({});
      return;
    }

    // 4. If move failed but user clicked another of their own pieces, switch selection
    const hasOptions = getMoveOptions(square);
    if (hasOptions) {
      setMoveFrom(square);
    } else {
      setMoveFrom(null);
      setOptionSquares({});
    }
  };

  const resetBoard = async () => {
    if (!gameId) return;
    try {
      setShowGameOverModal(true);
      if (mode === 'computer') setIsGameStarted(false);
      await updateDoc(doc(db, 'games', gameId), {
        fen: 'start',
        history: [],
        turn: 'w',
        winner: null,
        updatedAt: serverTimestamp()
      });
      closeRestartModal();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSwapSides = async () => {
    if (!gameId) return;
    try {
      const snap = await getDoc(doc(db, 'games', gameId));
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'playing' || data.status === 'waiting') {
           // Swap colors conceptually without breaking player identity variables!
           await updateDoc(doc(db, 'games', gameId), {
              hostColor: data.hostColor === 'b' ? 'w' : 'b'
           });
        }
      }
    } catch (e) {
      console.error("Failed to swap sides", e);
    }
  };

  const handleCopyCode = () => {
    if (!gameId) return;
    navigator.clipboard.writeText(gameId);
    setTooltipCopied(true);
    setTimeout(() => setTooltipCopied(false), 2000);
  };

  const getCustomBoardStyle = () => {
      switch(boardTheme) {
        case 'cyberpunk':
          return { darkSquare: '#334155', lightSquare: '#94a3b8' };
        case 'classic':
           return { darkSquare: '#779556', lightSquare: '#ebecd0' };
        case 'original':
           return { darkSquare: '#b58863', lightSquare: '#f0d9b5' };
        default: // neon
           return { darkSquare: '#581c87', lightSquare: '#d8b4fe' };
      }
  };

  const isGameOver = game.isGameOver();

  if (isInitializingGame && !gameId) {
    return (
      <div className="w-full h-[100dvh] flex flex-col items-center justify-center bg-[#0a0f1e] gap-4 font-sans text-white text-center p-6">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="flex flex-col gap-2">
           <p className="text-blue-200 text-lg font-bold animate-pulse">Initializing Board...</p>
           <p className="text-gray-400 text-xs text-center">Setting up your {mode} session</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={constraintsRef}
      className={cn(
        "w-full max-w-screen-2xl mx-auto h-[100dvh] flex flex-col items-center justify-center gap-2 p-0 sm:p-4 overflow-hidden",
        isEmbedded ? "pt-12" : "pt-20 lg:pt-12", "font-sans"
      )}
    >
      <div className="w-full flex-1 flex flex-col lg:flex-row items-center lg:items-center justify-center gap-4 lg:gap-12 min-h-0 px-4">
        
        {/* Left Side: Exit/Theme (Visible only on LG+, moved from top) */}
        <div className="hidden lg:flex flex-col gap-4 w-48 shrink-0">
          <button
            onClick={() => {
              setActiveGameId(null);
              navigate('/');
            }}
            className="flex items-center justify-center gap-2 px-6 py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 rounded-2xl transition-all font-bold group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> Exit Game
          </button>

          <div className="p-4 bg-[var(--color-glass-surface)] border border-[var(--color-glass-border)] rounded-2xl space-y-4">
            <p className="text-blue-200/50 text-xs font-black uppercase tracking-widest">Settings</p>
            <button
              onClick={() => setBoardTheme(prev => prev === 'neon' ? 'cyberpunk' : (prev === 'cyberpunk' ? 'classic' : (prev === 'classic' ? 'original' : 'neon')))}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/5 rounded-xl transition-all"
            >
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-bold capitalize">{boardTheme}</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-30" />
            </button>
            
            {!isWaiting && history.length === 0 && (
              <button
                 onClick={handleSwapSides}
                 className="w-full flex items-center gap-2 px-4 py-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl transition-all text-sm font-bold"
              >
                 <RotateCcw className="w-4 h-4" /> Swap Sides
              </button>
            )}

            {(!isWaiting && history.length > 0) && (
              <button
                 onClick={openRestartModal}
                 className="w-full flex items-center gap-2 px-4 py-3 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-xl transition-all text-sm font-bold"
              >
                 <RotateCcw className="w-4 h-4" /> Restart
              </button>
            )}
          </div>
          
          {mode === 'computer' && (
            <div className="p-4 bg-[var(--color-glass-surface)] border border-[var(--color-glass-border)] rounded-2xl space-y-3">
              <p className="text-blue-200/50 text-xs font-black uppercase tracking-widest">Difficulty</p>
              <div className="grid grid-cols-1 gap-2">
                 <select 
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                    className="w-full bg-black/40 border border-blue-500/30 rounded-xl px-4 py-3 text-white outline-none font-bold text-sm"
                 >
                    {[1,2,3,4,5,6,7,8].map(l => (
                       <option key={l} value={l}>Level {l}</option>
                    ))}
                    <option value={9}>Grandmaster</option>
                 </select>
                 {!isWaiting && !isGameStarted && (
                   <button
                      onClick={() => setIsGameStarted(true)}
                      className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl shadow-lg transition-all text-sm animate-pulse"
                   >
                     START GAME
                   </button>
                 )}
              </div>
            </div>
          )}
        </div>

        {/* Center/Board Area */}
        <div className="flex flex-col items-center min-w-0">
          
          {/* Mobile-only Top Row */}
          <div className="w-full max-w-[600px] flex lg:hidden justify-between items-center mb-2 px-2">
            <button
              onClick={() => {
                setActiveGameId(null);
                navigate('/');
              }}
              className="flex items-center gap-1.5 text-xs text-blue-200 hover:text-white transition-colors font-bold border border-blue-500/30 rounded-full px-3 py-1.5 bg-[var(--color-glass-surface)]"
            >
              <ArrowLeft className="w-4 h-4" /> Exit
            </button>
            
            <div className="flex gap-2">
               {(gameId && (mySymbol === 'w' || mode !== 'online')) && (
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
                     <Trash2 className="w-4 h-4" /> Destroy
                  </button>
               )}
               {!isWaiting && history.length === 0 && (
                  <button
                     onClick={handleSwapSides}
                     className="flex items-center gap-1.5 text-xs text-blue-200 border border-blue-500/30 rounded-full px-3 py-1.5 bg-[var(--color-glass-surface)]"
                  >
                     <RotateCcw className="w-4 h-4" /> Swap
                  </button>
               )}

               <button
                 onClick={() => setBoardTheme(prev => prev === 'neon' ? 'cyberpunk' : (prev === 'cyberpunk' ? 'classic' : (prev === 'classic' ? 'original' : 'neon')))}
                 className="flex items-center gap-1.5 text-xs text-blue-200 border border-blue-500/30 rounded-full px-3 py-1.5 bg-[var(--color-glass-surface)]"
               >
                 <Palette className="w-4 h-4" /> <span className="capitalize">{boardTheme}</span>
               </button>
            </div>
          </div>

          <div className={cn(
            "w-full max-w-[600px] flex flex-col items-center justify-center p-0 sm:p-6 rounded-none sm:rounded-[2.5rem] relative shadow-2xl backdrop-blur-2xl border-x-0 sm:border border-[var(--color-glass-border)] shrink-0",
             boardTheme === 'cyberpunk' ? 'bg-slate-900/80' : 'bg-[var(--color-glass-surface)]'
          )}>
            
            <AnimatePresence>
              {isGameOver && showGameOverModal && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl backdrop-blur-sm z-40"
                >
                  <div className="mb-4 sm:mb-6 px-6 sm:px-8 py-3 sm:py-4 rounded-full bg-white text-blue-900 font-extrabold text-xl sm:text-2xl md:text-3xl shadow-[0_0_30px_rgba(255,255,255,0.8)] text-center w-[90%] break-words">
                    {statusText}
                  </div>
                  <div className="flex flex-col gap-3 w-[80%] max-w-[300px]">
                    <button
                      onClick={resetBoard}
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold text-lg transition-colors shadow-lg hover:shadow-blue-500/50 focus:outline-none pointer-events-auto w-full"
                    >
                      <RotateCcw className="w-5 h-5" /> Play Again
                    </button>
                    <button
                      onClick={() => setShowGameOverModal(false)}
                      className="flex items-center justify-center gap-2 px-6 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-full font-medium text-sm transition-colors backdrop-blur-sm pointer-events-auto w-full"
                    >
                      View Board
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {isGameOver && !showGameOverModal && (
               <motion.button
                 initial={{ opacity: 0, scale: 0.8 }}
                 animate={{ opacity: 1, scale: 1 }}
                 onClick={() => setShowGameOverModal(true)}
                 className="absolute bottom-4 right-4 z-50 p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-2xl border-2 border-white/30 pointer-events-auto"
                 title="Show Results"
               >
                 <RotateCcw className="w-6 h-6 rotate-90" />
               </motion.button>
            )}

            {/* Header specific to Chess */}
          <div className="w-full flex justify-between items-center mb-2 px-4 sm:px-1">
             <div className="text-white font-bold">{opponentName}</div>
             <div className={cn("px-3 py-1 rounded-full text-xs font-bold", game.turn() === 'b' ? 'bg-blue-500 text-white' : 'bg-black/50 text-gray-400')}>
                {game.turn() === 'b' ? 'Thinking...' : 'Waiting'}
             </div>
          </div>

           <div className="w-full flex items-center justify-center relative my-0 sm:my-4">
             <div 
               className="w-full max-w-full sm:max-w-[400px] md:max-w-[500px] aspect-square rounded-none sm:rounded-md overflow-hidden sm:ring-4 ring-black/40 relative z-30 bg-[#333] flex"
             >
               <div className="w-full h-full grid grid-cols-8 grid-rows-8">
                  {(() => {
                    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
                    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
                    
                    // Rotate board purely based on mySymbol to enable physical board rotation
                    const displayFiles = mySymbol === 'b' ? [...files].reverse() : files;
                    const displayRanks = mySymbol === 'b' ? [...ranks].reverse() : ranks;
                    
                    return (
                       <>
                          {/* 1. Render all the squares (background + highlights) */}
                          {displayRanks.map((rank, rankIndex) => (
                             displayFiles.map((file, fileIndex) => {
                                const square = `${file}${rank}`;
                                const piece: any = game.get(square as any); // just for hasEnemy highlight detection
                                
                                const isDark = (fileIndex + rankIndex) % 2 === 1;
                                const squareColor = isDark ? getCustomBoardStyle().darkSquare : getCustomBoardStyle().lightSquare;
                                
                                const isSelected = moveFrom === square;
                                const isOption = !!optionSquares[square];
                                const hasEnemy = isOption && piece && piece.color !== game.turn();
                                
                                return (
                                  <div 
                                    key={`sq_${square}`}
                                    onClick={() => onSquareClick(square)}
                                    className="w-full h-full relative cursor-pointer flex items-center justify-center p-1"
                                    style={{ backgroundColor: isSelected ? 'rgba(250, 204, 21, 0.8)' : squareColor }}
                                  >
                                     {isOption && !hasEnemy && (
                                       <div className="absolute w-[30%] h-[30%] bg-blue-500/70 rounded-full z-10 pointer-events-none"></div>
                                     )}
                                     {isOption && hasEnemy && (
                                       <div className="absolute w-[80%] h-[80%] border-[6px] border-red-500/70 rounded-full z-10 pointer-events-none"></div>
                                     )}
                                  </div>
                                );
                             })
                          ))}
                          {/* 2. Render Animated Pieces absolutely tracking grid coordinates */}
                          {animatedPieces.map((p) => {
                             const fileIndex = displayFiles.indexOf(p.square[0]);
                             const rankIndex = displayRanks.indexOf(p.square[1]);
                             if (fileIndex === -1 || rankIndex === -1) return null;

                             // Since grid is 8x8, each cell is 12.5% width/height
                             const left = `${fileIndex * 12.5}%`;
                             const top = `${rankIndex * 12.5}%`;

                             return (
                                <motion.div
                                   key={p.id}
                                   layout
                                   initial={false}
                                   animate={{ left, top }}
                                   transition={{ type: "spring", stiffness: 350, damping: 25, mass: 1 }}
                                   className="absolute w-[12.5%] h-[12.5%] pointer-events-none z-20 flex items-center justify-center"
                                >
                                   <img 
                                      src={PIECE_IMAGES[`${p.type}_${p.color}`]} 
                                      className="w-[85%] h-[85%] select-none object-contain drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]"
                                      alt={`${p.color} ${p.type}`}
                                   />
                                </motion.div>
                             );
                          })}
                       </>
                    );
                 })()}
               </div>
             </div>
             {/* Removed Debug Info */}
            
            <AnimatePresence>
              {isGameOver && showGameOverModal && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-xl backdrop-blur-sm z-40"
                >
                  <div className="mb-4 sm:mb-6 px-6 sm:px-8 py-3 sm:py-4 rounded-full bg-white text-blue-900 font-extrabold text-xl sm:text-2xl md:text-3xl shadow-[0_0_30px_rgba(255,255,255,0.8)] text-center w-[90%] break-words">
                    {statusText}
                  </div>
                  <div className="flex flex-col gap-3 w-[80%] max-w-[280px]">
                    <button
                      onClick={resetBoard}
                      className="flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold text-lg transition-colors shadow-lg hover:shadow-blue-500/50 focus:outline-none pointer-events-auto"
                    >
                      <RotateCcw className="w-5 h-5" /> Play Again
                    </button>
                    <button
                      onClick={() => setShowGameOverModal(false)}
                      className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-full font-medium text-sm transition-colors backdrop-blur-sm pointer-events-auto"
                    >
                       View Board
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {isGameOver && !showGameOverModal && (
               <motion.button
                 initial={{ opacity: 0, scale: 0.8, y: 10 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 onClick={() => setShowGameOverModal(true)}
                 className="absolute bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-blue-600/90 hover:bg-blue-600 text-white rounded-full shadow-2xl border border-white/30 pointer-events-auto backdrop-blur-sm"
               >
                 <RotateCcw className="w-4 h-4 rotate-90" />
                 <span className="text-xs font-bold uppercase tracking-wider">Results</span>
               </motion.button>
            )}

            {isWaiting && (
               <div className="absolute inset-0 bg-blue-900/80 backdrop-blur-md flex flex-col items-center justify-center rounded-xl z-40">
                   <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                   <p className="text-xl sm:text-2xl font-bold text-white text-center px-4">Waiting for opponent...</p>
                   {mode === 'online' && gameId && (
                     <div className="mt-4 flex flex-col items-center gap-2">
                       <p className="text-xs sm:text-sm text-blue-200">Share this Room Code:</p>
                       <div className="flex items-center gap-2 bg-black/40 rounded-lg px-4 py-2 border border-blue-500/30">
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
                   <p className="text-xs sm:text-sm text-blue-200/50 mt-6 text-center w-[80%]">Or wait for someone to join randomly.</p>
               </div>
            )}
          </div>
          
          <div className="w-full flex justify-between items-center mt-2 px-1">
             <div className="text-white font-bold">{mySymbol === 'w' ? username : opponentName}</div>
             <div className={cn("px-3 py-1 rounded-full text-xs font-bold", game.turn() === 'w' ? 'bg-blue-500 text-white' : 'bg-black/50 text-gray-400')}>
                {game.turn() === 'w' ? 'Your Turn' : 'Waiting'}
             </div>
          </div>
        </div>

          {/* AI vs Player Bottom Controls (Mobile-ish View) */}
          <div className="lg:hidden w-full max-w-[600px] mt-4 px-2">
             {!isWaiting && mode === 'computer' && (
                <div className="flex items-center gap-3 bg-[var(--color-glass-surface)]/60 backdrop-blur-xl p-3 border border-[var(--color-glass-border)] rounded-[2rem] shadow-xl">
                   <div className="flex flex-col gap-1 flex-1 px-2">
                      <p className="text-[10px] font-black text-blue-200/50 uppercase tracking-widest pl-1">Level Selection</p>
                      <select 
                        value={difficulty}
                        onChange={(e) => setDifficulty(Number(e.target.value))}
                        className="w-full bg-black/40 border border-blue-500/20 rounded-xl px-4 py-2.5 text-white outline-none font-bold text-sm"
                      >
                        {[1,2,3,4,5,6,7,8].map(l => (
                          <option key={l} value={l}>Level {l}</option>
                        ))}
                        <option value={9}>Grandmaster</option>
                      </select>
                   </div>
                   
                   {!isGameStarted && (
                      <button
                        onClick={() => setIsGameStarted(true)}
                        className="flex-1 py-4 bg-gradient-to-r from-orange-600 to-orange-500 text-white font-black rounded-2xl shadow-lg transition-all text-sm animate-pulse uppercase"
                      >
                        Start Game
                      </button>
                   )}
                   
                   {isGameStarted && history.length > 0 && (
                      <button
                        onClick={openRestartModal}
                        className="p-4 bg-red-500/20 text-red-300 border border-red-500/30 rounded-2xl hover:bg-red-500/40 transition-colors"
                        title="Restart"
                      >
                        <RotateCcw className="w-5 h-5" />
                      </button>
                   )}
                </div>
             )}
          </div>
        </div>

        {/* Right Sidebar for PC (Optional space for more stats/info) */}
        <div className="hidden xl:flex flex-col gap-4 w-64 shrink-0">
           <div className="p-6 bg-[var(--color-glass-surface)] border border-[var(--color-glass-border)] rounded-3xl space-y-6">
              <h4 className="text-white font-black flex items-center gap-2">
                 <Shield className="w-5 h-5 text-blue-400" /> Match Info
              </h4>
              
              <div className="space-y-4">
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-blue-200/60 font-medium tracking-tight">Status</span>
                    <span className="text-white font-bold">{isGameOver ? 'Finished' : (isWaiting ? 'Ready' : 'In Progress')}</span>
                 </div>
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-blue-200/60 font-medium tracking-tight">Mode</span>
                    <span className="text-white font-bold capitalize">{mode}</span>
                 </div>
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-blue-200/60 font-medium tracking-tight">History</span>
                    <span className="text-white font-bold">{history.length} Moves</span>
                 </div>
              </div>

              <div className="pt-4 border-t border-white/5">
                 <p className="text-[10px] text-blue-200/30 font-black uppercase tracking-[0.2em] mb-4">Move History</p>
                 <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar space-y-1">
                    {history.length === 0 ? (
                       <p className="text-xs text-white/20 italic">No moves yet</p>
                    ) : (
                       history.map((m, i) => (
                          <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-white/5 text-[10px] text-white/80 font-mono">
                             <span className="opacity-40">{i+1}.</span>
                             <span className="font-bold">{m.san}</span>
                             <span className="opacity-40 text-[8px] uppercase">{m.color === 'w' ? 'White' : 'Black'}</span>
                          </div>
                       ))
                    )}
                 </div>
              </div>
           </div>
        </div>

      </div>

      {mode === 'online' && (
        <motion.div
           drag
           dragConstraints={constraintsRef}
           dragElastic={0.1}
           dragMomentum={false}
           initial={false}
           className="fixed z-50 bottom-4 right-4 md:bottom-8 md:right-8 flex flex-col items-end pointer-events-none"
        >
           <AnimatePresence>
             {isChatOpen && (
               <motion.div
                 initial={{ opacity: 0, scale: 0.8, y: 20 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 exit={{ opacity: 0, scale: 0.8, y: 20 }}
                 className="w-80 h-96 bg-[var(--color-glass-surface)] backdrop-blur-2xl border border-[var(--color-glass-border)] rounded-2xl shadow-2xl mb-4 overflow-hidden flex flex-col pointer-events-auto"
               >
                 <div className="bg-black/40 border-b border-[var(--color-glass-border)] px-4 py-3 flex items-center justify-between">
                    <div className="flex bg-black/40 rounded-full p-1">
                       <button 
                         onClick={() => setChatTab('chat')}
                         className={cn("px-3 py-1 rounded-full text-xs font-bold transition-colors", chatTab === 'chat' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}
                       >
                          Chat
                       </button>
                       <button 
                         onClick={() => setChatTab('players')}
                         className={cn("px-3 py-1 rounded-full text-xs font-bold transition-colors", chatTab === 'players' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}
                       >
                          Players
                       </button>
                    </div>
                    <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                      <X className="w-5 h-5" />
                    </button>
                 </div>

                 {chatTab === 'chat' ? (
                    <>
                       <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scrollbar-hide">
                         {messages.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                               <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                               <p className="text-sm">No messages yet.</p>
                            </div>
                         ) : (
                            messages.map(msg => {
                              const isMe = msg.senderId === userId;
                              return (
                                <div key={msg.id} className={cn("flex flex-col max-w-[85%]", isMe ? "self-end items-end" : "self-start items-start")}>
                                  <span className="text-[10px] text-gray-400 mb-0.5 px-1">{isMe ? 'You' : msg.senderName}</span>
                                  <div className={cn("px-3 py-2 rounded-2xl text-sm", isMe ? "bg-blue-600 text-white rounded-br-sm" : "bg-white/10 text-white rounded-bl-sm")}>
                                    {msg.text}
                                  </div>
                                </div>
                              )
                            })
                         )}
                         <div ref={messagesEndRef} />
                       </div>
                       
                       <form onSubmit={handleSendMessage} className="p-3 bg-black/20 border-t border-[var(--color-glass-border)]">
                         <div className="relative">
                           <input
                             type="text"
                             value={newMessage}
                             onChange={e => setNewMessage(e.target.value)}
                             placeholder="Write a message..."
                             className="w-full bg-black/40 border border-blue-500/30 rounded-xl py-2 pl-3 pr-10 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                           />
                           <button type="submit" disabled={!newMessage.trim()} className="absolute right-1 top-1 p-1.5 text-blue-400 hover:text-blue-300 disabled:opacity-50 disabled:hover:text-blue-400 transition-colors">
                             <Send className="w-4 h-4" />
                           </button>
                         </div>
                       </form>
                    </>
                 ) : (
                    <div className="flex-1 flex flex-col p-4">
                       <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Room Members</h4>
                       <div className="flex flex-col gap-2 flex-1">
                          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-[var(--color-glass-border)]">
                             <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-black text-white">X</div>
                             <span className="font-medium text-white flex-1 truncate">
                                {mySymbol === 'w' ? `${username} (You)` : (opponentName || 'Player 1')}
                             </span>
                             {mySymbol === 'w' && <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">Admin</span>}
                          </div>
                          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-[var(--color-glass-border)]">
                             <div className="w-8 h-8 rounded-full bg-fuchsia-500 flex items-center justify-center font-black text-white">O</div>
                             <span className="font-medium text-white flex-1 truncate">
                                {isWaiting ? <span className="text-fuchsia-300 italic text-sm">Waiting...</span> : (mySymbol === 'b' ? `${username} (You)` : opponentName)}
                             </span>
                             {!isWaiting && mySymbol === 'w' && (
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
                       
                       <div className="mt-auto bg-black/40 border border-blue-500/30 rounded-xl p-3 flex flex-col gap-2 items-center">
                          <p className="text-xs text-gray-400 text-center">Invite friends using Code:</p>
                          <div className="flex w-full">
                             <input type="text" readOnly value={gameId || ''} className="flex-1 bg-black/30 text-white font-mono font-bold text-center border border-blue-500/30 rounded-l-lg outline-none" />
                             <button onClick={handleCopyCode} className="bg-blue-600 hover:bg-blue-500 font-bold text-white px-3 py-2 rounded-r-lg text-sm transition-colors flex items-center gap-1">
                                {tooltipCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                             </button>
                          </div>
                       </div>
                    </div>
                 )}
               </motion.div>
             )}
           </AnimatePresence>

           {!isChatOpen && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsChatOpen(true)}
                className="w-14 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center justify-center text-white pointer-events-auto border-2 border-white/10"
              >
                 <MessageSquare className="w-6 h-6" />
                 {/* Notification dot placeholder */}
                 <span className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full animate-pulse border-2 border-slate-900" />
              </motion.button>
           )}
        </motion.div>
      )}

      {/* RESTART MODAL */}
      <AnimatePresence>
        {isRestartModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 sm:p-8 max-w-sm w-full shadow-2xl relative flex flex-col items-center"
            >
              <button 
                onClick={closeRestartModal}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-4">
                 <RotateCcw className="w-8 h-8 text-blue-400" />
              </div>
              
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center">Restart Game?</h2>
              <p className="text-sm text-slate-400 text-center mb-8">
                Are you sure you want to restart the current game? This action will wipe the board.
              </p>

              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={resetBoard}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg hover:shadow-red-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" /> Yes, Restart
                </button>
                <button
                  onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2"
                >
                   {isSoundEnabled ? "Disable Game Sounds" : "Enable Game Sounds"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
