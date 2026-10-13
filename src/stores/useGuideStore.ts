// src/stores/useGuideStore.ts
import { create } from 'zustand';

export type GuideTopicId =
  | 'sales'
  | 'cash'
  | 'logbook'
  | 'plans'
  | 'reports'
  | 'scanner'
  | 'members'
  | 'products'
  | 'dashboard'
  | 'users';

interface GuideState {
  isOpen: boolean;
  activeTopicId: GuideTopicId;
  searchQuery: string;
  openGuide: (topicId?: GuideTopicId) => void;
  closeGuide: () => void;
  setTopic: (topicId: GuideTopicId) => void;
  setSearchQuery: (query: string) => void;
}

export const useGuideStore = create<GuideState>((set) => ({
  isOpen: false,
  activeTopicId: 'sales',
  searchQuery: '',
  openGuide: (topicId) =>
    set((state) => ({
      isOpen: true,
      activeTopicId: topicId || state.activeTopicId || 'sales',
      searchQuery: '',
    })),
  closeGuide: () => set({ isOpen: false }),
  setTopic: (topicId) => set({ activeTopicId: topicId, searchQuery: '' }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
