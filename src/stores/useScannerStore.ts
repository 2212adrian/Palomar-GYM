// src/stores/useScannerStore.ts
import { create } from 'zustand';

interface ScannerStore {
  isOpen: boolean;
  openScanner: () => void;
  closeScanner: () => void;
  toggleScanner: () => void;
}

export const useScannerStore = create<ScannerStore>((set) => ({
  isOpen: false,
  openScanner: () => set({ isOpen: true }),
  closeScanner: () => set({ isOpen: false }),
  toggleScanner: () => set((state) => ({ isOpen: !state.isOpen })),
}));