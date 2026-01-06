import { create } from 'zustand';

interface PlaybackStore {
  currentTime: number;
  isPlaying: boolean;

  // Actions
  setCurrentTime: (time: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  seekRelative: (delta: number) => void;
}

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
  currentTime: 0,
  isPlaying: false,

  setCurrentTime: (time: number) => {
    set({ currentTime: Math.max(0, time) });
  },

  play: () => {
    set({ isPlaying: true });
  },

  pause: () => {
    set({ isPlaying: false });
  },

  toggle: () => {
    set((state) => ({ isPlaying: !state.isPlaying }));
  },

  seek: (time: number) => {
    set({ currentTime: Math.max(0, time), isPlaying: false });
  },

  seekRelative: (delta: number) => {
    const current = get().currentTime;
    set({ currentTime: Math.max(0, current + delta), isPlaying: false });
  },
}));
