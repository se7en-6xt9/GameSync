import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import ErrorBoundary from './components/ErrorBoundary';

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
