import { BrowserRouter, Routes, Route } from 'react-router-dom';
import React, { ErrorInfo, ReactNode } from 'react';
import IframeMessageHandler from './components/IframeMessageHandler';
import Navbar from './components/Navbar';
import NamePopup from './components/NamePopup';
import Home from './pages/Home';
import TicTacToeLobby from './pages/TicTacToeLobby';
import Game from './pages/Game';
import ChessLobby from './pages/ChessLobby';
import ChessGame from './pages/ChessGame';
import LudoLobby from './pages/LudoLobby';
import LudoGame from './pages/LudoGame';
import Profile from './pages/Profile';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-4 text-center">
          <h1 className="text-4xl font-black text-white mb-4">Oops! Something went wrong.</h1>
          <p className="text-purple-200/80 mb-8 max-w-md">
            The application crashed. This might be due to a cached version. 
            Try clearing your browser cache or clicking the button below.
          </p>
          <button 
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              window.location.reload();
            }}
            className="px-8 py-4 bg-purple-600 text-white font-bold rounded-2xl hover:bg-purple-500 transition-all"
          >
            Reset and Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        {/* 
          This handler listens for window.postMessage to grab ID/Username 
          from the parent website (like MelodySync) if embedded in an iframe.
        */}
        <IframeMessageHandler />
        
        <Navbar />
        <NamePopup />
        
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tictactoe" element={<TicTacToeLobby />} />
          <Route path="/chess" element={<ChessLobby />} />
          <Route path="/ludo" element={<LudoLobby />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/game/:mode" element={<Game />} />
          <Route path="/chessgame/:mode" element={<ChessGame />} />
          <Route path="/ludogame/:mode" element={<LudoGame />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
