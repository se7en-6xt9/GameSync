import { BrowserRouter, Routes, Route } from 'react-router-dom';
import IframeMessageHandler from './components/IframeMessageHandler';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Game from './pages/Game';
import Profile from './pages/Profile';

export default function App() {
  return (
    <BrowserRouter>
      {/* 
        This handler listens for window.postMessage to grab ID/Username 
        from the parent website (like MelodySync) if embedded in an iframe.
      */}
      <IframeMessageHandler />
      
      <Navbar />
      
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/game/:mode" element={<Game />} />
      </Routes>
    </BrowserRouter>
  );
}
