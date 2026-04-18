import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

interface UserState {
  userId: string;
  username: string;
  activeGameId: string | null;
  isNamePopupOpen: boolean;
  setUserData: (id: string, name: string) => void;
  setActiveGameId: (gameId: string | null) => void;
  setNamePopupOpen: (isOpen: boolean) => void;
}

export const useUserStore = create<UserState>((set) => {
  let existingUserId = localStorage.getItem('game_user_id');
  if (!existingUserId) {
    existingUserId = uuidv4();
    localStorage.setItem('game_user_id', existingUserId);
  }
  const existingUsername = localStorage.getItem('game_username') || '';
  const existingGameId = localStorage.getItem('active_game_id');
  
  return {
    userId: existingUserId,
    username: existingUsername,
    activeGameId: existingGameId,
    isNamePopupOpen: false,
    setUserData: (id: string, name: string) => {
      localStorage.setItem('game_user_id', id);
      localStorage.setItem('game_username', name);
      set({ userId: id, username: name });
    },
    setActiveGameId: (gameId: string | null) => {
      if (gameId) localStorage.setItem('active_game_id', gameId);
      else localStorage.removeItem('active_game_id');
      set({ activeGameId: gameId });
    },
    setNamePopupOpen: (isOpen: boolean) => set({ isNamePopupOpen: isOpen })
  }
});
