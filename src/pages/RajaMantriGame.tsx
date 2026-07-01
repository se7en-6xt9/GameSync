import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { db } from '../firebase';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  setDoc,
  serverTimestamp,
  arrayUnion,
  getDoc
} from 'firebase/firestore';
import { 
  Crown, Scroll, Shield, ShieldAlert, ArrowLeft, Users, User, Play, 
  Share2, Trophy, Eye, EyeOff, RotateCcw, Home, Sparkles, AlertTriangle, Check, HelpCircle
} from 'lucide-react';

// --- Types & Interfaces ---
type Role = 'Raja' | 'Mantri' | 'Sipahi' | 'Chor';

interface PlayerDetail {
  name: string;
  isReady: boolean;
  isBot: boolean;
  color?: string; // Optional styling
}

interface RoundHistory {
  round: number;
  roles: { [uid: string]: string };
  guessedUserId: string;
  guessIsCorrect: boolean;
  scores: { [uid: string]: number };
}

interface GameSessionData {
  gameType: string;
  mode: 'online' | 'pvp-local' | 'computer';
  roomId: string;
  hostId: string;
  status: 'waiting' | 'playing' | 'finished';
  players: string[];
  playerDetails: { [uid: string]: PlayerDetail };
  rajaMantriState: {
    round: number;
    totalRounds: number;
    phase: 'waiting_players' | 'reveal_roles' | 'raja_revealed' | 'round_results' | 'game_over';
    roles: { [uid: string]: string };
    revealedRoles: { [uid: string]: boolean };
    playerRevealedLocal: { [uid: string]: boolean };
    sipahiUserId: string;
    guessedChorUserId: string;
    chorUserId: string;
    rajaUserId: string;
    mantriUserId: string;
    guessIsCorrect: boolean;
    roundScores: { [uid: string]: number };
    cumulativeScores: { [uid: string]: number };
    history: RoundHistory[];
  };
}

// --- Indian Bot Names Helper ---
const BOT_NAMES = ['Ramesh (Bot)', 'Suresh (Bot)', 'Amit (Bot)', 'Vijay (Bot)'];

export default function RajaMantriGame() {
  const navigate = useNavigate();
  const { mode: urlMode } = useParams();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('roomId');

  const { username, userId, setNamePopupOpen } = useUserStore();

  // --- Core States ---
  const [loading, setLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [gameData, setGameData] = useState<GameSessionData | null>(null);

  // For Local / Offline states when mode != 'online'
  const [localGame, setLocalGame] = useState<GameSessionData | null>(null);

  // --- Local Pass & Play helpers ---
  const [localPassIndex, setLocalPassIndex] = useState<number>(0); // which player's turn to review role
  const [localRevealedCurrent, setLocalRevealedCurrent] = useState<boolean>(false);

  // --- Bot guessing delay state ---
  const [botIsThinking, setBotIsThinking] = useState(false);
  const [botMessage, setBotMessage] = useState('');

  // Is Current User the Host?
  const isHost = gameData ? gameData.hostId === userId : true;

  // Real data state to display in JSX (unified for offline and online)
  const currentData = urlMode === 'online' ? gameData : localGame;

  // Fetch or initialize match
  useEffect(() => {
    if (urlMode === 'online') {
      if (!roomId) {
        navigate('/rajamantri');
        return;
      }

      setLoading(true);
      const gameRef = doc(db, 'games', roomId);
      const unsubscribe = onSnapshot(gameRef, (docSnap) => {
        if (!docSnap.exists()) {
          alert('Room not found!');
          navigate('/rajamantri');
          return;
        }

        const data = docSnap.data() as GameSessionData;
        setGameData(data);
        setLoading(false);

        // Auto join user to player list if not already present, up to 4 players
        if (!data.players.includes(userId as string) && data.status === 'waiting' && data.players.length < 4) {
          const updatedPlayers = [...data.players, userId];
          const updatedDetails = {
            ...data.playerDetails,
            [userId as string]: {
              name: username || 'Player',
              isReady: false,
              isBot: false,
            }
          };

          updateDoc(gameRef, {
            players: updatedPlayers,
            playerDetails: updatedDetails,
            updatedAt: serverTimestamp()
          });
        }
      }, (error) => {
        console.error('Error listening to game document:', error);
        alert('Failed to connect to room. Re-routing.');
        navigate('/rajamantri');
      });

      return () => unsubscribe();
    } else {
      // Offline Game setup
      setupOfflineGame();
    }
  }, [urlMode, roomId, userId, username]);

  // --- Audio Sound Fallback ---
  const playLocalSound = (sound: 'victory' | 'wrong' | 'reveal' | 'click') => {
    try {
      // Minimal synthesized audio to avoid missing asset problems
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (sound === 'victory') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
        osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.3); // C6
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } else if (sound === 'wrong') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
        osc.frequency.setValueAtTime(147, ctx.currentTime + 0.15); // D3
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } else if (sound === 'reveal') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
    } catch (e) {
      // Fallback if audio context is blocked
    }
  };

  const setupOfflineGame = () => {
    const isPvp = searchParams.get('mode') === 'pvp-local';
    const totalRds = parseInt(searchParams.get('rounds') || '4', 10);
    
    // Assign player list
    let finalPlayers: string[] = [];
    let finalDetails: { [uid: string]: PlayerDetail } = {};

    if (isPvp) {
      const names = [
        searchParams.get('p1') || 'Player 1',
        searchParams.get('p2') || 'Player 2',
        searchParams.get('p3') || 'Player 3',
        searchParams.get('p4') || 'Player 4'
      ];
      finalPlayers = ['local_1', 'local_2', 'local_3', 'local_4'];
      names.forEach((name, i) => {
        finalDetails[finalPlayers[i]] = {
          name,
          isReady: true,
          isBot: false,
        };
      });
    } else {
      // Vs Computer
      const humanName = searchParams.get('p1') || username || 'You';
      finalPlayers = [userId as string, 'bot_1', 'bot_2', 'bot_3'];
      finalDetails[userId as string] = {
        name: humanName,
        isReady: true,
        isBot: false,
      };
      BOT_NAMES.slice(0, 3).forEach((botName, i) => {
        finalDetails[`bot_${i + 1}`] = {
          name: botName,
          isReady: true,
          isBot: true,
        };
      });
    }

    const initialScores: { [uid: string]: number } = {};
    finalPlayers.forEach(p => {
      initialScores[p] = 0;
    });

    const session: GameSessionData = {
      gameType: 'rajamantri',
      mode: isPvp ? 'pvp-local' : 'computer',
      roomId: 'local',
      hostId: userId as string,
      status: 'playing', // Starts playing immediately in local
      players: finalPlayers,
      playerDetails: finalDetails,
      rajaMantriState: {
        round: 1,
        totalRounds: totalRds,
        phase: 'reveal_roles',
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
        cumulativeScores: initialScores,
        history: []
      }
    };

    // Shuffle roles immediately for the first round
    const preparedSession = triggerRoleShuffle(session);
    setLocalGame(preparedSession);
    setLocalPassIndex(0);
    setLocalRevealedCurrent(false);
    setLoading(false);
  };

  // Helper to shuffle roles and setup key assignments
  const triggerRoleShuffle = (session: GameSessionData): GameSessionData => {
    const roles: Role[] = ['Raja', 'Mantri', 'Sipahi', 'Chor'];
    
    // Fisher-Yates Shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    const assignedRoles: { [uid: string]: string } = {};
    const revealed: { [uid: string]: boolean } = {};
    const localRevealed: { [uid: string]: boolean } = {};
    const roundScores: { [uid: string]: number } = {};

    let rajaUid = '';
    let mantriUid = '';
    let sipahiUid = '';
    let chorUid = '';

    session.players.forEach((p, idx) => {
      const pRole = roles[idx];
      assignedRoles[p] = pRole;
      revealed[p] = false; // keep all hidden at start
      localRevealed[p] = session.playerDetails[p].isBot; // bots automatically "know" their role
      roundScores[p] = 0;

      if (pRole === 'Raja') rajaUid = p;
      if (pRole === 'Mantri') mantriUid = p;
      if (pRole === 'Sipahi') sipahiUid = p;
      if (pRole === 'Chor') chorUid = p;
    });

    return {
      ...session,
      rajaMantriState: {
        ...session.rajaMantriState,
        phase: 'reveal_roles',
        roles: assignedRoles,
        revealedRoles: revealed,
        playerRevealedLocal: localRevealed,
        sipahiUserId: sipahiUid,
        guessedChorUserId: '',
        chorUserId: chorUid,
        rajaUserId: rajaUid,
        mantriUserId: mantriUid,
        guessIsCorrect: false,
        roundScores,
      }
    };
  };

  // --- Online Lobby: Toggle Ready ---
  const toggleReady = async () => {
    if (!roomId) return;
    playLocalSound('click');
    const isCurrentlyReady = gameData?.playerDetails[userId as string]?.isReady || false;
    await updateDoc(doc(db, 'games', roomId), {
      [`playerDetails.${userId}.isReady`]: !isCurrentlyReady,
      updatedAt: serverTimestamp()
    });
  };

  // --- Online Lobby: Host Starts Match ---
  const handleHostStartOnlineMatch = async () => {
    if (!roomId || !gameData) return;
    
    // Validate 4 players
    if (gameData.players.length !== 4) {
      alert("A proper online match requires exactly 4 players to start.");
      return;
    }
    
    // Validate all players are ready
    const allReady = gameData.players.every(p => gameData.playerDetails[p]?.isReady);
    if (!allReady) {
      alert("All 4 players must be Ready before the host can start the game.");
      return;
    }

    playLocalSound('click');

    // Make copy of players and details
    let finalPlayers = [...gameData.players];
    let finalDetails = { ...gameData.playerDetails };

    // Set initial cumulative scores to 0
    const initialScores: { [uid: string]: number } = {};
    finalPlayers.forEach(p => {
      initialScores[p] = 0;
    });

    // Generate initial session state
    let newSession: GameSessionData = {
      ...gameData,
      status: 'playing',
      players: finalPlayers,
      playerDetails: finalDetails,
      rajaMantriState: {
        ...gameData.rajaMantriState,
        cumulativeScores: initialScores,
      }
    };

    newSession = triggerRoleShuffle(newSession);

    await updateDoc(doc(db, 'games', roomId), {
      status: 'playing',
      players: finalPlayers,
      playerDetails: finalDetails,
      rajaMantriState: newSession.rajaMantriState,
      updatedAt: serverTimestamp()
    });
  };

  // --- Role Review: Click "I've Seen My Role" ---
  const handleUserConfirmedRoleSeen = async () => {
    playLocalSound('click');
    if (urlMode === 'online') {
      if (!roomId || !gameData) return;
      
      const updatedLocalRevealed = {
        ...gameData.rajaMantriState.playerRevealedLocal,
        [userId as string]: true
      };

      // Check if ALL human players in the game have seen their roles
      const allHumansSeen = gameData.players
        .filter(p => !gameData.playerDetails[p].isBot)
        .every(p => p === userId ? true : updatedLocalRevealed[p]);

      if (allHumansSeen) {
        // Transition to Raja Revealed phase
        // Raja is automatically revealed
        const newRevealed = { ...gameData.rajaMantriState.revealedRoles };
        newRevealed[gameData.rajaMantriState.rajaUserId] = true;

        await updateDoc(doc(db, 'games', roomId), {
          'rajaMantriState.playerRevealedLocal': updatedLocalRevealed,
          'rajaMantriState.revealedRoles': newRevealed,
          'rajaMantriState.phase': 'raja_revealed',
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'games', roomId), {
          [`rajaMantriState.playerRevealedLocal.${userId}`]: true,
          updatedAt: serverTimestamp()
        });
      }
    } else {
      // Offline Flow
      if (!localGame) return;

      const currentReviewer = localGame.players[localPassIndex];
      const updatedLocalRevealed = {
        ...localGame.rajaMantriState.playerRevealedLocal,
        [currentReviewer]: true
      };

      const nextPassIndex = localPassIndex + 1;
      
      if (nextPassIndex < localGame.players.length) {
        // Continue to next local player
        setLocalGame({
          ...localGame,
          rajaMantriState: {
            ...localGame.rajaMantriState,
            playerRevealedLocal: updatedLocalRevealed
          }
        });
        setLocalPassIndex(nextPassIndex);
        setLocalRevealedCurrent(false);
      } else {
        // All local players have reviewed
        const rajaUid = localGame.rajaMantriState.rajaUserId;
        const newRevealed = { ...localGame.rajaMantriState.revealedRoles };
        newRevealed[rajaUid] = true; // Raja revealed!

        const updatedLocalGame: GameSessionData = {
          ...localGame,
          rajaMantriState: {
            ...localGame.rajaMantriState,
            playerRevealedLocal: updatedLocalRevealed,
            revealedRoles: newRevealed,
            phase: 'raja_revealed'
          }
        };

        setLocalGame(updatedLocalGame);
        
        // If Sipahi is a Bot in Vs Computer mode, let the Bot Guess!
        if (updatedLocalGame.mode === 'computer') {
          handleBotSipahiTurn(updatedLocalGame);
        }
      }
    }
  };

  // Bot Thinking and Choice delay
  const handleBotSipahiTurn = (session: GameSessionData) => {
    const sipahiId = session.rajaMantriState.sipahiUserId;
    if (!session.playerDetails[sipahiId].isBot) return; // not a bot

    // Determine candidates (Mantri & Chor)
    const candidates = session.players.filter(p => 
      p !== session.rajaMantriState.rajaUserId && 
      p !== session.rajaMantriState.sipahiUserId
    );

    setBotIsThinking(true);
    setBotMessage(`${session.playerDetails[sipahiId].name} (Sipahi) is interrogating...`);

    const dialoguePool = [
      "I smell a thief nearby...",
      "Look at their faces! One of them is definitely guilty...",
      "Hmm... my detective instincts point to one of you...",
      "A राजा's justice will be served! Tell me, who is the thief?",
    ];
    setBotMessage(dialoguePool[Math.floor(Math.random() * dialoguePool.length)]);

    setTimeout(() => {
      // Choose one candidate
      // 60% chance to guess correctly
      const actualChor = session.rajaMantriState.chorUserId;
      let chosenUserId = '';
      if (Math.random() < 0.6) {
        chosenUserId = actualChor;
      } else {
        chosenUserId = candidates.find(c => c !== actualChor) || candidates[0];
      }

      handleSipahiGuess(chosenUserId, session);
      setBotIsThinking(false);
    }, 2800);
  };

  // Monitor online status to handle Bot guessing if Sipahi is Bot
  useEffect(() => {
    if (urlMode === 'online' && gameData && gameData.rajaMantriState.phase === 'raja_revealed') {
      const sipahiId = gameData.rajaMantriState.sipahiUserId;
      const sipahiIsBot = gameData.playerDetails[sipahiId]?.isBot;
      
      // Only host is responsible for executing bot logical steps online to prevent race conditions
      if (sipahiIsBot && isHost && !gameData.rajaMantriState.guessedChorUserId && !botIsThinking) {
        handleOnlineBotGuess();
      }
    }
  }, [gameData?.rajaMantriState?.phase, gameData?.rajaMantriState?.sipahiUserId, urlMode]);

  const handleOnlineBotGuess = async () => {
    if (!roomId || !gameData) return;
    setBotIsThinking(true);
    
    const sipahiId = gameData.rajaMantriState.sipahiUserId;
    const sipahiName = gameData.playerDetails[sipahiId].name;

    // Simulate thinking delay in DB
    setTimeout(async () => {
      const candidates = gameData.players.filter(p => 
        p !== gameData.rajaMantriState.rajaUserId && 
        p !== gameData.rajaMantriState.sipahiUserId
      );

      const actualChor = gameData.rajaMantriState.chorUserId;
      let chosenUserId = '';
      if (Math.random() < 0.6) {
        chosenUserId = actualChor;
      } else {
        chosenUserId = candidates.find(c => c !== actualChor) || candidates[0];
      }

      setBotIsThinking(false);
      await executeFinalGuessPoints(chosenUserId, gameData);
    }, 2500);
  };

  // --- Core Guess Processing ---
  const handleSipahiGuess = (selectedUserId: string, sessionContext?: GameSessionData) => {
    const activeSession = sessionContext || currentData;
    if (!activeSession) return;

    if (urlMode === 'online') {
      executeFinalGuessPoints(selectedUserId, activeSession);
    } else {
      // Local flow
      const chorId = activeSession.rajaMantriState.chorUserId;
      const isCorrect = selectedUserId === chorId;

      if (isCorrect) {
        playLocalSound('victory');
      } else {
        playLocalSound('wrong');
      }

      const pScores: { [uid: string]: number } = {};
      const newRoundScores: { [uid: string]: number } = {};

      activeSession.players.forEach(p => {
        const role = activeSession.rajaMantriState.roles[p];
        let scoreObtained = 0;
        
        if (role === 'Raja') scoreObtained = 1000;
        else if (role === 'Mantri') scoreObtained = 900;
        else if (role === 'Sipahi') {
          scoreObtained = isCorrect ? 500 : 0;
        } else if (role === 'Chor') {
          scoreObtained = isCorrect ? 0 : 500; // Steals!
        }

        newRoundScores[p] = scoreObtained;
        pScores[p] = (activeSession.rajaMantriState.cumulativeScores[p] || 0) + scoreObtained;
      });

      // Fully reveal all roles
      const allRevealed: { [uid: string]: boolean } = {};
      activeSession.players.forEach(p => {
        allRevealed[p] = true;
      });

      const roundSummary: RoundHistory = {
        round: activeSession.rajaMantriState.round,
        roles: activeSession.rajaMantriState.roles,
        guessedUserId: selectedUserId,
        guessIsCorrect: isCorrect,
        scores: newRoundScores,
      };

      const finalRound = activeSession.rajaMantriState.round >= activeSession.rajaMantriState.totalRounds;
      const nextPhase = finalRound ? 'game_over' : 'round_results';

      setLocalGame({
        ...activeSession,
        rajaMantriState: {
          ...activeSession.rajaMantriState,
          phase: nextPhase,
          revealedRoles: allRevealed,
          guessedChorUserId: selectedUserId,
          guessIsCorrect: isCorrect,
          roundScores: newRoundScores,
          cumulativeScores: pScores,
          history: [...activeSession.rajaMantriState.history, roundSummary]
        }
      });
    }
  };

  const executeFinalGuessPoints = async (selectedUserId: string, session: GameSessionData) => {
    if (!roomId) return;
    
    const chorId = session.rajaMantriState.chorUserId;
    const isCorrect = selectedUserId === chorId;

    if (isCorrect) {
      playLocalSound('victory');
    } else {
      playLocalSound('wrong');
    }

    const pScores: { [uid: string]: number } = {};
    const newRoundScores: { [uid: string]: number } = {};

    session.players.forEach(p => {
      const role = session.rajaMantriState.roles[p];
      let scoreObtained = 0;
      
      if (role === 'Raja') scoreObtained = 1000;
      else if (role === 'Mantri') scoreObtained = 900;
      else if (role === 'Sipahi') {
        scoreObtained = isCorrect ? 500 : 0;
      } else if (role === 'Chor') {
        scoreObtained = isCorrect ? 0 : 500;
      }

      newRoundScores[p] = scoreObtained;
      pScores[p] = (session.rajaMantriState.cumulativeScores[p] || 0) + scoreObtained;
    });

    const allRevealed: { [uid: string]: boolean } = {};
    session.players.forEach(p => {
      allRevealed[p] = true;
    });

    const roundSummary: RoundHistory = {
      round: session.rajaMantriState.round,
      roles: session.rajaMantriState.roles,
      guessedUserId: selectedUserId,
      guessIsCorrect: isCorrect,
      scores: newRoundScores,
    };

    const finalRound = session.rajaMantriState.round >= session.rajaMantriState.totalRounds;
    const nextPhase = finalRound ? 'game_over' : 'round_results';

    await updateDoc(doc(db, 'games', roomId), {
      'rajaMantriState.phase': nextPhase,
      'rajaMantriState.revealedRoles': allRevealed,
      'rajaMantriState.guessedChorUserId': selectedUserId,
      'rajaMantriState.guessIsCorrect': isCorrect,
      'rajaMantriState.roundScores': newRoundScores,
      'rajaMantriState.cumulativeScores': pScores,
      'rajaMantriState.history': arrayUnion(roundSummary),
      updatedAt: serverTimestamp()
    });
  };

  // --- Next Round Setup ---
  const handleNextRound = async () => {
    playLocalSound('click');
    if (urlMode === 'online') {
      if (!roomId || !gameData) return;

      const nextRoundNum = gameData.rajaMantriState.round + 1;
      let nextSession: GameSessionData = {
        ...gameData,
        rajaMantriState: {
          ...gameData.rajaMantriState,
          round: nextRoundNum,
        }
      };

      nextSession = triggerRoleShuffle(nextSession);

      await updateDoc(doc(db, 'games', roomId), {
        'rajaMantriState': nextSession.rajaMantriState,
        updatedAt: serverTimestamp()
      });
    } else {
      // Local flow
      if (!localGame) return;

      const nextRoundNum = localGame.rajaMantriState.round + 1;
      let nextSession: GameSessionData = {
        ...localGame,
        rajaMantriState: {
          ...localGame.rajaMantriState,
          round: nextRoundNum,
        }
      };

      nextSession = triggerRoleShuffle(nextSession);
      setLocalGame(nextSession);
      setLocalPassIndex(0);
      setLocalRevealedCurrent(false);
    }
  };

  // --- Reset/Rematch Game ---
  const handleRematch = async () => {
    playLocalSound('click');
    if (urlMode === 'online') {
      if (!roomId || !gameData) return;

      const initialScores: { [uid: string]: number } = {};
      gameData.players.forEach(p => {
        initialScores[p] = 0;
      });

      let resetSession: GameSessionData = {
        ...gameData,
        rajaMantriState: {
          ...gameData.rajaMantriState,
          round: 1,
          cumulativeScores: initialScores,
          history: []
        }
      };

      resetSession = triggerRoleShuffle(resetSession);

      await updateDoc(doc(db, 'games', roomId), {
        'rajaMantriState': resetSession.rajaMantriState,
        updatedAt: serverTimestamp()
      });
    } else {
      setupOfflineGame();
    }
  };

  // Copy Room Link to Clipboard
  const copyRoomLink = () => {
    if (!roomId) return;
    const link = `${window.location.origin}/rajamantrigame/online?roomId=${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  // --- Render Functions ---

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <Crown className="w-16 h-16 text-amber-400 animate-bounce mb-4" />
        <h2 className="text-xl font-bold text-white tracking-widest uppercase">Loading Game...</h2>
        <p className="text-purple-300/60 text-sm mt-2">Setting up the court for the Raja...</p>
      </div>
    );
  }

  // No active data
  if (!currentData) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-white uppercase">Game session not found</h2>
        <button 
          onClick={() => navigate('/rajamantri')}
          className="mt-6 px-6 py-2 bg-purple-600 text-white rounded-full font-bold hover:bg-purple-500"
        >
          Return to Lobby
        </button>
      </div>
    );
  }

  const { round, totalRounds, phase, roles, revealedRoles, playerRevealedLocal, sipahiUserId, guessedChorUserId, chorUserId, rajaUserId, mantriUserId, guessIsCorrect, roundScores, cumulativeScores, history } = currentData.rajaMantriState;

  // Render Role Card Details
  const getRoleTheme = (role: Role) => {
    switch (role) {
      case 'Raja':
        return {
          title: 'Raja',
          points: 1000,
          color: 'from-amber-400 to-yellow-600 border-amber-400/50',
          bg: 'bg-amber-500/10',
          text: 'text-amber-400',
          icon: Crown,
          desc: 'The Sovereign King. Rules the court and secures 1000 points automatically.'
        };
      case 'Mantri':
        return {
          title: 'Mantri',
          points: 900,
          color: 'from-purple-400 to-indigo-600 border-purple-400/50',
          bg: 'bg-purple-500/10',
          text: 'text-purple-400',
          icon: Scroll,
          desc: 'The Wisest Minister. Guides the state and locks in 900 points automatically.'
        };
      case 'Sipahi':
        return {
          title: 'Sipahi',
          points: 500,
          color: 'from-blue-400 to-teal-600 border-blue-400/50',
          bg: 'bg-blue-500/10',
          text: 'text-blue-400',
          icon: Shield,
          desc: 'The Brave Soldier. Must guess who is the Chor. If right, gains 500 points. If wrong, gets 0.'
        };
      case 'Chor':
        return {
          title: 'Chor',
          points: 0,
          color: 'from-rose-500 to-red-800 border-rose-500/50',
          bg: 'bg-rose-500/10',
          text: 'text-rose-400',
          icon: ShieldAlert,
          desc: 'The Crafty Thief. Scores 0 points if caught, but steals the Sipahi’s 500 points if the Sipahi fails!'
        };
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pt-24 pb-16 px-4 md:px-8 max-w-7xl mx-auto flex flex-col gap-8">
      
      {/* HEADER NAVIGATION & STATS ROW */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white/5 border border-white/10 p-6 rounded-3xl backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/rajamantri')}
            className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-purple-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-xs uppercase font-black tracking-widest text-rose-400">Raja Mantri Chor Sipahi</span>
            <h1 className="text-2xl font-black flex items-center gap-2 text-white">
              {currentData.mode === 'online' ? `Online Room #${roomId}` : currentData.mode === 'computer' ? 'Vs Computer AI' : 'Local Pass & Play'}
            </h1>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <div className="bg-white/5 px-5 py-2.5 rounded-2xl border border-white/5 flex flex-col items-center">
            <span className="text-[10px] text-white/40 uppercase font-black tracking-widest">Round</span>
            <span className="text-xl font-black text-amber-400">{round} <span className="text-white/40 text-xs">/ {totalRounds}</span></span>
          </div>

          {currentData.mode === 'online' && (
            <button 
              onClick={copyRoomLink}
              className="flex items-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-500 rounded-2xl font-bold text-sm transition-all shadow-md shadow-purple-500/10"
            >
              <Share2 className="w-4 h-4" /> {isCopied ? 'Copied Link!' : 'Invite Friend'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: ACTIVE PHASE COMPONENT */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* ONLINE WAITING ROOM LOBBY */}
          {currentData.mode === 'online' && phase === 'waiting_players' && (
            <div className="bg-gradient-to-br from-purple-900/10 to-indigo-900/10 border border-white/10 p-8 rounded-[2rem] flex flex-col items-center text-center">
              <Users className="w-16 h-16 text-purple-400 animate-pulse mb-4" />
              <h2 className="text-3xl font-black">Lobby Waiting Room</h2>
              <p className="text-purple-200/60 max-w-md mt-2 text-sm">
                Waiting for players to join. Total players required: 4. All players must mark themselves as Ready before the host can start.
              </p>

              <div className="w-full max-w-md bg-black/40 border border-white/10 p-5 rounded-2xl mt-8 flex flex-col gap-3">
                <span className="text-xs uppercase font-black tracking-widest text-purple-400">Current Court ( {currentData.players.length} / 4 )</span>
                {currentData.players.map((pUid) => {
                  const detail = currentData.playerDetails[pUid];
                  const isUser = pUid === userId;
                  return (
                    <div key={pUid} className="flex justify-between items-center p-3.5 bg-white/5 rounded-xl border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center font-bold text-purple-300">
                          {detail?.name?.[0]?.toUpperCase()}
                        </div>
                        <span className="font-bold text-white">{detail?.name} {isUser && <span className="text-xs text-rose-400 font-medium">(You)</span>}</span>
                      </div>
                      <span className={`text-[10px] uppercase font-black px-3 py-1 rounded-full ${
                        detail?.isReady 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                          : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      }`}>
                        {detail?.isReady ? 'Ready' : 'Waiting'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-8 w-full max-w-md">
                <button
                  onClick={toggleReady}
                  className={`flex-1 py-4 rounded-xl font-black text-sm uppercase tracking-wider transition-all border ${
                    gameData?.playerDetails[userId as string]?.isReady 
                      ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30' 
                      : 'bg-green-600 hover:bg-green-500 text-white border-transparent'
                  }`}
                >
                  {gameData?.playerDetails[userId as string]?.isReady ? 'Cancel Ready' : 'I am Ready!'}
                </button>

                {isHost && (() => {
                  const hasFourPlayers = currentData.players.length === 4;
                  const allReady = currentData.players.every(p => currentData.playerDetails[p]?.isReady);
                  const canStart = hasFourPlayers && allReady;

                  return (
                    <button
                      onClick={handleHostStartOnlineMatch}
                      disabled={!canStart}
                      className={`flex-1 py-4 font-black rounded-xl text-sm uppercase tracking-wider transition-all ${
                        canStart 
                          ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white hover:from-amber-400 hover:to-rose-400 cursor-pointer shadow-lg shadow-rose-500/25' 
                          : 'bg-white/10 text-white/40 cursor-not-allowed border border-white/5'
                      }`}
                    >
                      {canStart ? 'Start Game' : 'Waiting for Ready...'}
                    </button>
                  );
                })()}
              </div>
            </div>
          )}

          {/* PHASE 1: ROLE REVEAL AND SECRECY FLOW */}
          {phase === 'reveal_roles' && (
            <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem] flex flex-col items-center">
              
              <div className="flex items-center gap-2 mb-6">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span className="text-xs uppercase font-black tracking-widest text-purple-300">Phase 1: Secrecy Reveal</span>
              </div>

              {/* Online Mode Role Reveal */}
              {currentData.mode === 'online' && (
                <div className="flex flex-col items-center text-center w-full max-w-md">
                  <h3 className="text-2xl font-black mb-1">Verify Your Secret Role</h3>
                  <p className="text-purple-200/60 text-xs mb-8">No one else can see this. Keep your device safe from other eyes!</p>

                  <AnimatePresence mode="wait">
                    {playerRevealedLocal[userId as string] ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full bg-black/40 border border-white/5 p-6 rounded-3xl flex flex-col items-center text-center"
                      >
                        <Check className="w-12 h-12 text-green-400 mb-4 bg-green-500/10 p-2.5 rounded-full" />
                        <h4 className="font-bold text-white text-lg">Role Verified!</h4>
                        <p className="text-purple-200/50 text-xs mt-1 max-w-xs">
                          Waiting for other players to verify and confirm their secret roles...
                        </p>
                      </motion.div>
                    ) : (
                      <RoleCardRevealer 
                        role={roles[userId as string] as Role} 
                        playerName={username} 
                        onConfirm={handleUserConfirmedRoleSeen} 
                      />
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Offline Pass & Play Role Reveal */}
              {currentData.mode === 'pvp-local' && (
                <div className="flex flex-col items-center text-center w-full max-w-md">
                  <h3 className="text-2xl font-black mb-1">Pass the Screen</h3>
                  <p className="text-purple-200/60 text-xs mb-8">Each player must review their role privately!</p>

                  <AnimatePresence mode="wait">
                    {!localRevealedCurrent ? (
                      <motion.div 
                        key="pass-screen"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        className="w-full bg-gradient-to-b from-purple-900/10 to-transparent border border-purple-500/20 p-8 rounded-3xl flex flex-col items-center text-center"
                      >
                        <User className="w-16 h-16 text-purple-400 mb-4 bg-purple-500/10 p-3.5 rounded-full animate-pulse" />
                        <span className="text-[10px] uppercase font-black tracking-widest text-purple-300">Passing Turn</span>
                        <h4 className="text-2xl font-black text-white mt-1">Pass to {currentData.playerDetails[currentData.players[localPassIndex]].name}</h4>
                        <p className="text-purple-200/50 text-xs mt-2 max-w-xs">
                          Ensure other players look away before revealing your role card.
                        </p>

                        <button
                          onClick={() => {
                            playLocalSound('reveal');
                            setLocalRevealedCurrent(true);
                          }}
                          className="mt-8 w-full py-4 bg-purple-600 hover:bg-purple-500 font-bold rounded-2xl text-sm uppercase tracking-wider transition-all"
                        >
                          I am {currentData.playerDetails[currentData.players[localPassIndex]].name} - Reveal
                        </button>
                      </motion.div>
                    ) : (
                      <RoleCardRevealer 
                        key="role-reveal"
                        role={roles[currentData.players[localPassIndex]] as Role} 
                        playerName={currentData.playerDetails[currentData.players[localPassIndex]].name} 
                        onConfirm={handleUserConfirmedRoleSeen} 
                      />
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Vs Computer Role Reveal */}
              {currentData.mode === 'computer' && (
                <div className="flex flex-col items-center text-center w-full max-w-md">
                  <h3 className="text-2xl font-black mb-1">Review Your Role Card</h3>
                  <p className="text-purple-200/60 text-xs mb-8">Bots already received their secret roles.</p>

                  <RoleCardRevealer 
                    role={roles[userId as string] as Role} 
                    playerName={currentData.playerDetails[userId as string].name} 
                    onConfirm={handleUserConfirmedRoleSeen} 
                  />
                </div>
              )}

            </div>
          )}

          {/* PHASE 2: RAJA REVEALED AND SIPAHI GUESS PHASE */}
          {phase === 'raja_revealed' && (
            <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem] flex flex-col gap-8">
              
              {/* Raja revealed announcement */}
              <div className="flex flex-col sm:flex-row items-center gap-6 bg-amber-500/10 border border-amber-500/20 p-6 rounded-3xl">
                <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400">
                  <Crown className="w-10 h-10" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Identity Revealed</span>
                  <h3 className="text-2xl font-black text-white mt-0.5">
                    {currentData.playerDetails[rajaUserId]?.name} is the RAJA!
                  </h3>
                  <p className="text-purple-200/60 text-xs mt-1">
                    The Raja automatically takes 1000 points. Now, the brave Sipahi must identify the Chor!
                  </p>
                </div>
              </div>

              {/* Bot thinking dialog */}
              {botIsThinking && (
                <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-3xl flex flex-col items-center text-center gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce" />
                    <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce delay-100" />
                    <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce delay-200" />
                  </div>
                  <h4 className="font-bold text-white text-base">Detective Sipahi is thinking...</h4>
                  <p className="text-blue-300 italic text-sm">"{botMessage}"</p>
                </div>
              )}

              {/* Sipahi Guess Panel */}
              {!botIsThinking && (
                <div className="flex flex-col gap-6">
                  
                  {/* Guess explanation */}
                  <div className="text-center border-b border-white/5 pb-6">
                    <span className="text-xs uppercase font-black tracking-widest text-rose-400">Deduction Stage</span>
                    <h2 className="text-2xl font-black text-white mt-1">
                      Who is the CHOR?
                    </h2>
                    <p className="text-purple-200/60 text-xs mt-1.5 max-w-md mx-auto">
                      Sipahi is <span className="text-blue-400 font-bold">{currentData.playerDetails[sipahiUserId]?.name}</span>. They must choose who among the remaining two players is the Chor.
                    </p>
                  </div>

                  {/* Interactive Buttons for candidates */}
                  {/* Candidates are the ones who are NOT Raja and NOT Sipahi */}
                  {(() => {
                    const candidates = currentData.players.filter(p => p !== rajaUserId && p !== sipahiUserId);
                    const isCurrentUserSipahi = sipahiUserId === userId;

                    // For Local Pass and play, we pass the device to the Sipahi to make the guess
                    const isLocalPvp = currentData.mode === 'pvp-local';

                    return (
                      <div className="flex flex-col items-center gap-6">
                        {isLocalPvp && (
                          <div className="w-full bg-purple-900/10 border border-purple-500/20 p-5 rounded-2xl text-center mb-2">
                            <span className="text-[10px] uppercase font-black text-purple-300 tracking-wider">Pass device to Sipahi</span>
                            <h4 className="text-lg font-bold mt-0.5">{currentData.playerDetails[sipahiUserId]?.name}, make your choice!</h4>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                          {candidates.map(candidateId => {
                            const isSelectable = isCurrentUserSipahi || isLocalPvp;
                            const detail = currentData.playerDetails[candidateId];

                            return (
                              <button
                                key={candidateId}
                                disabled={!isSelectable}
                                onClick={() => handleSipahiGuess(candidateId)}
                                className={`p-8 rounded-3xl border flex flex-col items-center gap-4 transition-all ${
                                  isSelectable
                                    ? 'bg-black/40 border-white/10 hover:border-amber-500 hover:scale-[1.02] shadow-xl hover:shadow-amber-500/5'
                                    : 'bg-black/60 border-white/5 opacity-80 cursor-default'
                                }`}
                              >
                                <div className="w-14 h-14 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-bold text-lg text-purple-300">
                                  {detail?.name?.[0]?.toUpperCase() || '?'}
                                </div>
                                <div className="text-center">
                                  <h4 className="font-bold text-white text-lg">{detail?.name}</h4>
                                  <p className="text-[10px] text-purple-300/40 uppercase tracking-widest font-bold mt-0.5">Accuse Player</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {!isCurrentUserSipahi && !isLocalPvp && (
                          <div className="bg-white/5 border border-white/5 p-4 rounded-2xl text-center w-full">
                            <HelpCircle className="w-8 h-8 text-blue-400 mx-auto animate-pulse mb-2" />
                            <p className="text-sm text-purple-200/80">
                              Waiting for <span className="text-blue-400 font-bold">{currentData.playerDetails[sipahiUserId]?.name}</span> to guess the Chor...
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>
              )}

            </div>
          )}

          {/* PHASE 3: ROUND RESULTS */}
          {phase === 'round_results' && (
            <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem] flex flex-col gap-8">
              
              {/* Guess result announcement banner */}
              <div className={`p-8 rounded-3xl border text-center flex flex-col items-center gap-3 relative overflow-hidden ${
                guessIsCorrect 
                  ? 'bg-green-500/10 border-green-500/30 shadow-lg shadow-green-500/5' 
                  : 'bg-red-500/10 border-red-500/30 shadow-lg shadow-red-500/5'
              }`}>
                {/* Visual effect */}
                <div className={`absolute top-0 inset-x-0 h-1.5 ${guessIsCorrect ? 'bg-green-500' : 'bg-red-500'}`} />

                {guessIsCorrect ? (
                  <>
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 mb-2">
                      <Check className="w-10 h-10" />
                    </div>
                    <span className="text-xs uppercase font-black tracking-widest text-green-400">Correct Accusation</span>
                    <h3 className="text-3xl font-black text-white">The Chor was Caught!</h3>
                    <p className="text-purple-200/60 text-sm max-w-md mt-1">
                      Sipahi <span className="text-blue-400 font-bold">{currentData.playerDetails[sipahiUserId]?.name}</span> guessed correctly!
                      The thief was indeed <span className="text-rose-400 font-bold">{currentData.playerDetails[chorUserId]?.name}</span>!
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center text-red-400 mb-2">
                      <ShieldAlert className="w-10 h-10" />
                    </div>
                    <span className="text-xs uppercase font-black tracking-widest text-red-400">Failed Accusation</span>
                    <h3 className="text-3xl font-black text-white">The Chor Steals the Points!</h3>
                    <p className="text-purple-200/60 text-sm max-w-md mt-1">
                      Sipahi <span className="text-blue-400 font-bold">{currentData.playerDetails[sipahiUserId]?.name}</span> accused <span className="text-purple-400 font-bold">{currentData.playerDetails[guessedChorUserId]?.name}</span> wrongly!
                      The actual thief was <span className="text-rose-400 font-bold">{currentData.playerDetails[chorUserId]?.name}</span>!
                    </p>
                  </>
                )}
              </div>

              {/* Score distribution grid for the round */}
              <div>
                <h4 className="text-white/40 text-xs font-black uppercase tracking-widest mb-4">Points Awarded This Round</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {currentData.players.map((uid) => {
                    const rScore = roundScores[uid] || 0;
                    const rRole = roles[uid] as Role;
                    const theme = getRoleTheme(rRole);
                    const IconComp = theme.icon;

                    return (
                      <div key={uid} className={`p-5 rounded-2xl border bg-black/40 flex flex-col items-center text-center gap-3 ${theme.color}`}>
                        <div className={`p-2.5 rounded-xl ${theme.bg}`}>
                          <IconComp className={`w-5 h-5 ${theme.text}`} />
                        </div>
                        <div>
                          <h5 className="font-bold text-white text-sm">{currentData.playerDetails[uid]?.name}</h5>
                          <span className="text-[10px] text-white/50">{theme.title}</span>
                        </div>
                        <span className={`text-xl font-black ${rScore > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                          +{rScore} pts
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action button to continue */}
              <div className="flex justify-center mt-4">
                {currentData.mode === 'online' ? (
                  isHost ? (
                    <button
                      onClick={handleNextRound}
                      className="px-12 py-4 bg-gradient-to-r from-amber-500 to-rose-500 text-white font-black rounded-2xl shadow-lg shadow-rose-500/10 hover:from-amber-400 hover:to-rose-400 text-sm uppercase tracking-widest"
                    >
                      Start Round {round + 1}
                    </button>
                  ) : (
                    <p className="text-purple-300/60 text-sm italic animate-pulse">
                      Waiting for the host to start Round {round + 1}...
                    </p>
                  )
                ) : (
                  <button
                    onClick={handleNextRound}
                    className="px-12 py-4 bg-gradient-to-r from-amber-500 to-rose-500 text-white font-black rounded-2xl shadow-lg shadow-rose-500/10 hover:from-amber-400 hover:to-rose-400 text-sm uppercase tracking-widest"
                  >
                    Start Round {round + 1}
                  </button>
                )}
              </div>

            </div>
          )}

          {/* PHASE 4: GAME OVER */}
          {phase === 'game_over' && (
            <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem] flex flex-col gap-8">
              
              <div className="text-center flex flex-col items-center">
                <Trophy className="w-16 h-16 text-amber-400 animate-bounce mb-3" />
                <span className="text-xs uppercase font-black tracking-widest text-amber-400">Grand Finale</span>
                <h2 className="text-4xl font-black text-white mt-1">Match Completed!</h2>
                <p className="text-purple-200/60 text-xs mt-1.5 max-w-sm">
                  All {totalRounds} rounds have finished. Here are the final cumulative standings!
                </p>
              </div>

              {/* Podium View */}
              {(() => {
                const sortedStandings = [...currentData.players].sort((a, b) => 
                  (cumulativeScores[b] || 0) - (cumulativeScores[a] || 0)
                );

                return (
                  <div className="flex flex-col gap-6">
                    
                    {/* Winner details */}
                    <div className="bg-amber-500/10 border border-amber-500/30 p-8 rounded-3xl text-center flex flex-col items-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
                      <Crown className="w-12 h-12 text-amber-400 mb-3" />
                      <span className="text-[10px] uppercase font-black text-amber-400 tracking-wider">Overall Winner</span>
                      <h3 className="text-3xl font-black text-white mt-0.5">{currentData.playerDetails[sortedStandings[0]]?.name}</h3>
                      <span className="text-2xl font-black text-amber-400 mt-2">
                        {cumulativeScores[sortedStandings[0]] || 0} <span className="text-xs text-white/50">Total Points</span>
                      </span>
                    </div>

                    {/* Standard List */}
                    <div className="flex flex-col gap-2.5">
                      {sortedStandings.map((pUid, idx) => {
                        const detail = currentData.playerDetails[pUid];
                        const score = cumulativeScores[pUid] || 0;
                        const isFirst = idx === 0;

                        return (
                          <div 
                            key={`standing-${pUid}`}
                            className={`p-4 rounded-2xl border flex justify-between items-center ${
                              isFirst 
                                ? 'bg-amber-500/5 border-amber-500/20' 
                                : 'bg-white/5 border-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${
                                idx === 0 ? 'bg-amber-500 text-black' :
                                idx === 1 ? 'bg-gray-400 text-black' :
                                idx === 2 ? 'bg-orange-600 text-white' :
                                'bg-white/10 text-white/40'
                              }`}>
                                {idx + 1}
                              </span>
                              <span className="font-bold text-white text-base">{detail?.name}</span>
                            </div>
                            <span className="font-black text-white text-lg">{score} pts</span>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                );
              })()}

              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-4">
                <button
                  onClick={handleRematch}
                  className="px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Rematch / Restart
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black rounded-2xl text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" /> Back to Hub
                </button>
              </div>

            </div>
          )}

        </div>

        {/* RIGHT COLUMN: CORE SCOREBOARD, ROUND SUMMARY & GAME INFO */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* CUMULATIVE LEADERBOARD */}
          <div className="bg-white/5 border border-white/10 p-6 rounded-3xl backdrop-blur-xl">
            <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2 uppercase tracking-wide border-b border-white/5 pb-3">
              <Trophy className="w-5 h-5 text-amber-400" /> Leaderboard
            </h3>

            <div className="flex flex-col gap-2.5">
              {currentData.players.map((uid) => {
                const detail = currentData.playerDetails[uid];
                const score = cumulativeScores[uid] || 0;
                const isUser = uid === userId;

                return (
                  <div 
                    key={`score-${uid}`}
                    className={`p-3.5 rounded-xl border flex justify-between items-center transition-all ${
                      isUser 
                        ? 'bg-purple-500/10 border-purple-500/30' 
                        : 'bg-black/30 border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-bold text-xs">
                        {detail?.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-sm">
                          {detail?.name} {isUser && <span className="text-[10px] text-rose-400">(You)</span>}
                        </span>
                        {detail?.isBot && <span className="text-[9px] text-amber-400 font-bold uppercase tracking-widest">Bot AI</span>}
                      </div>
                    </div>
                    <span className="font-black text-amber-400 text-base">{score}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* HISTORICAL ROUND BREAKDOWNS */}
          {history.length > 0 && (
            <div className="bg-white/5 border border-white/10 p-6 rounded-3xl backdrop-blur-xl">
              <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2 uppercase tracking-wide border-b border-white/5 pb-3">
                <Scroll className="w-5 h-5 text-purple-400" /> Round History
              </h3>

              <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
                {history.map((hist, idx) => (
                  <div key={`history-${idx}`} className="p-3 bg-black/40 border border-white/5 rounded-xl text-xs flex flex-col gap-2">
                    <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                      <span className="font-black text-amber-400 uppercase tracking-widest">Round {hist.round}</span>
                      <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider ${
                        hist.guessIsCorrect 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {hist.guessIsCorrect ? 'Caught Chor' : 'Wrong Accuse'}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1 text-purple-200/60">
                      <div>
                        Raja: <span className="text-white font-medium">{currentData.playerDetails[Object.keys(hist.roles).find(k => hist.roles[k] === 'Raja') || '']?.name}</span>
                      </div>
                      <div>
                        Mantri: <span className="text-white font-medium">{currentData.playerDetails[Object.keys(hist.roles).find(k => hist.roles[k] === 'Mantri') || '']?.name}</span>
                      </div>
                      <div>
                        Sipahi: <span className="text-white font-medium">{currentData.playerDetails[Object.keys(hist.roles).find(k => hist.roles[k] === 'Sipahi') || '']?.name}</span>
                      </div>
                      <div>
                        Chor: <span className="text-white font-medium">{currentData.playerDetails[Object.keys(hist.roles).find(k => hist.roles[k] === 'Chor') || '']?.name}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GAME RULES REFERENCE */}
          <div className="bg-white/5 border border-white/10 p-6 rounded-3xl backdrop-blur-xl text-xs flex flex-col gap-3 text-purple-200/70">
            <h4 className="font-bold text-white text-sm uppercase tracking-wider border-b border-white/5 pb-2">Court Roles & Rules</h4>
            <div className="flex gap-2.5 items-start">
              <span className="text-amber-400 font-bold">👑 Raja</span>
              <span>Always scores <span className="text-white font-bold">1000 points</span> each round.</span>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="text-purple-400 font-bold">📜 Mantri</span>
              <span>Always scores <span className="text-white font-bold">900 points</span> each round.</span>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="text-blue-400 font-bold">🛡️ Sipahi</span>
              <span>Guesses who is Chor. Sahi Guess: <span className="text-white font-bold">500 pts</span> to Sipahi. Galat Guess: <span className="text-white font-bold">0 pts</span> to Sipahi, <span className="text-white font-bold">500 pts</span> to Chor.</span>
            </div>
            <div className="flex gap-2.5 items-start">
              <span className="text-rose-400 font-bold">🎭 Chor</span>
              <span>Attempts to escape detection. Caught: <span className="text-white font-bold">0 pts</span>. Escapes: <span className="text-white font-bold">500 pts</span> stolen from Sipahi!</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}

// --- Helper Child Component for Secrecy Revealer Card ---
interface RevealerProps {
  role: Role;
  playerName: string;
  onConfirm: () => void;
}

function RoleCardRevealer({ role, playerName, onConfirm }: RevealerProps) {
  const [isRevealed, setIsRevealed] = useState(false);

  // Styling Details
  const getRoleTheme = (r: Role) => {
    switch (r) {
      case 'Raja':
        return {
          title: 'Raja',
          points: 1000,
          color: 'from-amber-400 to-yellow-600 border-amber-400/40',
          bg: 'bg-amber-500/10',
          text: 'text-amber-400',
          icon: Crown,
          desc: 'The Sovereign King. Rules the court and secures 1000 points automatically.'
        };
      case 'Mantri':
        return {
          title: 'Mantri',
          points: 900,
          color: 'from-purple-400 to-indigo-600 border-purple-400/40',
          bg: 'bg-purple-500/10',
          text: 'text-purple-400',
          icon: Scroll,
          desc: 'The Wisest Minister. Guides the state and locks in 900 points automatically.'
        };
      case 'Sipahi':
        return {
          title: 'Sipahi',
          points: 500,
          color: 'from-blue-400 to-teal-600 border-blue-400/40',
          bg: 'bg-blue-500/10',
          text: 'text-blue-400',
          icon: Shield,
          desc: 'The Brave Soldier. Must guess who is the Chor. If right, gains 500 points. If wrong, gets 0.'
        };
      case 'Chor':
        return {
          title: 'Chor',
          points: 0,
          color: 'from-rose-500 to-red-800 border-rose-500/40',
          bg: 'bg-rose-500/10',
          text: 'text-rose-400',
          icon: ShieldAlert,
          desc: 'The Crafty Thief. Scores 0 points if caught, but steals the Sipahi’s 500 points if the Sipahi fails!'
        };
    }
  };

  const theme = getRoleTheme(role);
  const IconComp = theme.icon;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full flex flex-col items-center gap-6"
    >
      <div className="text-center">
        <span className="text-[10px] uppercase font-black text-rose-400 tracking-widest">Active Player Card</span>
        <h4 className="text-xl font-bold mt-0.5">{playerName}</h4>
      </div>

      <div className="w-full relative aspect-[3/4] max-w-xs rounded-3xl overflow-hidden shadow-2xl border border-white/10 group">
        <AnimatePresence mode="wait">
          {!isRevealed ? (
            <motion.div 
              key="back-card"
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: -90, opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setIsRevealed(true)}
              className="absolute inset-0 bg-gradient-to-b from-purple-950 via-indigo-950 to-black flex flex-col items-center justify-center p-6 text-center cursor-pointer border border-purple-500/20 hover:border-purple-500/40"
            >
              <div className="w-20 h-20 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-6 border border-purple-500/20 shadow-lg">
                <HelpCircle className="w-10 h-10 text-purple-400 animate-pulse" />
              </div>
              <h4 className="font-black text-xl text-white">Tap to Reveal Role</h4>
              <p className="text-[10px] text-purple-300/40 uppercase tracking-widest font-black mt-2">Strictly Private Card</p>
            </motion.div>
          ) : (
            <motion.div 
              key="front-card"
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: -90, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={`absolute inset-0 bg-gradient-to-b ${theme.bg} to-black/90 p-6 flex flex-col items-center justify-center border-2 ${theme.color} text-center`}
            >
              <div className={`p-4 rounded-2xl bg-black/40 border ${theme.color} mb-6`}>
                <IconComp className={`w-12 h-12 ${theme.text}`} />
              </div>
              <span className="text-[10px] uppercase font-black tracking-widest text-white/40">Your Role</span>
              <h3 className={`text-4xl font-black mt-1 mb-2 ${theme.text} uppercase tracking-wide`}>{theme.title}</h3>
              <p className="text-xs text-purple-200/70 max-w-[200px] leading-relaxed">
                {theme.desc}
              </p>

              <button
                onClick={() => setIsRevealed(false)}
                className="absolute top-4 right-4 p-2 bg-black/40 rounded-full hover:bg-black/60 text-white/60 hover:text-white transition-colors"
                title="Hide Card"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        disabled={!isRevealed}
        onClick={onConfirm}
        className="w-full py-4 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 disabled:opacity-50 disabled:cursor-not-allowed font-bold rounded-2xl text-sm uppercase tracking-wider transition-all shadow-lg"
      >
        I have seen my role (Keep secret)
      </button>
    </motion.div>
  );
}
