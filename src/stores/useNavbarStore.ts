// src/stores/useNavbarStore.ts
import { create } from 'zustand';

interface NavbarStore {
  activeFloating: 'sales' | 'logbook' | null;
  setActiveFloating: (floating: 'sales' | 'logbook' | null) => void;
  closeFloating: () => void;
}

export const useNavbarStore = create<NavbarStore>((set) => ({
  activeFloating: null,
  setActiveFloating: (activeFloating) => set({ activeFloating }),
  closeFloating: () => set({ activeFloating: null }),
}));