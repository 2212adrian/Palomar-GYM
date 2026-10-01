// src/stores/useNavbarStore.ts
import { create } from 'zustand';

interface NavbarStore {
  activeFloating: 'sales' | 'logbook' | null;
  navClickTimestamp: number;
  setActiveFloating: (floating: 'sales' | 'logbook' | null) => void;
  closeFloating: () => void;
  triggerNavReset: () => void;
}

export const useNavbarStore = create<NavbarStore>((set) => ({
  activeFloating: null,
  navClickTimestamp: 0,
  setActiveFloating: (activeFloating) =>
    set((state) => ({
      activeFloating,
      navClickTimestamp: activeFloating
        ? Date.now()
        : state.navClickTimestamp,
    })),
  closeFloating: () => set({ activeFloating: null }),
  triggerNavReset: () => set({ navClickTimestamp: Date.now() }),
}));