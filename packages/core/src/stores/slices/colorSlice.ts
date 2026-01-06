import type { StateCreator } from 'zustand';
import type { ColorRegion, FrameMask } from '../../types';
import type { ClipSlice } from './clipSlice';

export interface ColorSlice {
  colorRegions: ColorRegion[];

  addColorRegion: (region: ColorRegion) => void;
  removeColorRegion: (id: string) => void;
  updateColorRegionProgress: (id: string, processedFrames: number, frameMask?: FrameMask) => void;
  setColorRegionComplete: (id: string) => void;
}

export const createColorSlice: StateCreator<ClipSlice & ColorSlice, [], [], ColorSlice> = (set) => ({
  colorRegions: [],

  addColorRegion: (region: ColorRegion) => {
    set((state) => ({ colorRegions: [...state.colorRegions, region] }));
  },
  removeColorRegion: (id: string) => {
    set((state) => ({ colorRegions: state.colorRegions.filter((r) => r.id !== id) }));
  },
  updateColorRegionProgress: (id: string, processedFrames: number, frameMask?: FrameMask) => {
    set((state) => ({
      colorRegions: state.colorRegions.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          processedFrames,
          frameMasks: frameMask ? [...r.frameMasks, frameMask] : r.frameMasks,
        };
      }),
    }));
  },
  setColorRegionComplete: (id: string) => {
    set((state) => ({
      colorRegions: state.colorRegions.map((r) => {
        if (r.id !== id) return r;
        return { ...r, isProcessing: false };
      }),
    }));
  },
});

