import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

interface UserState {
  userId: string;
  username: string;
  isGuest: boolean;
  activeGameId: string | null;
  setUserData: (id: string, name: string) => void;
  setActiveGameId: (gameId: string | null) => void;
}

export const useUserStore = create<UserState>((set) => {
  // If we're standalone and no local storage exists, make one
  const existingUserId = localStorage.getItem('game_user_id') || uuidv4();
  const existingUsername = localStorage.getItem('game_username') || `Guest_${Math.floor(Math.random() * 1000)}`;
  const existingGameId = localStorage.getItem('active_game_id');
  
  if (!localStorage.getItem('game_user_id')) {
    localStorage.setItem('game_user_id', existingUserId);
    localStorage.setItem('game_username', existingUsername);
  }

  return {
    userId: existingUserId,
    username: existingUsername,
    isGuest: true,
    activeGameId: existingGameId,
    setUserData: (id: string, name: string) => {
      localStorage.setItem('game_user_id', id);
      localStorage.setItem('game_username', name);
      set({ userId: id, username: name, isGuest: false });
    },
    setActiveGameId: (gameId: string | null) => {
      if (gameId) localStorage.setItem('active_game_id', gameId);
      else localStorage.removeItem('active_game_id');
      set({ activeGameId: gameId });
    }
  }
});
