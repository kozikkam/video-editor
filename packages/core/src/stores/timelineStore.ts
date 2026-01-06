import { temporal } from 'zundo';
import { create } from 'zustand';
import { createColorSlice, type ColorSlice } from './slices/colorSlice';
import { createClipSlice, type ClipSlice } from './slices/clipSlice';

export type TimelineStore = ClipSlice & ColorSlice;

// Custom equality that doesn't stringify large mask data
function shallowEqualColorRegions(
  a: { clips: unknown; colorRegions: { id: string; clipId: string; isProcessing: boolean }[] },
  b: { clips: unknown; colorRegions: { id: string; clipId: string; isProcessing: boolean }[] },
): boolean {
  // Compare clips with JSON (they're small)
  if (JSON.stringify(a.clips) !== JSON.stringify(b.clips)) return false;

  // Compare colorRegions by id, clipId, and isProcessing (not mask data)
  if (a.colorRegions.length !== b.colorRegions.length) return false;

  for (let i = 0; i < a.colorRegions.length; i++) {
    const regionA = a.colorRegions[i];
    const regionB = b.colorRegions[i];
    if (
      regionA.id !== regionB.id ||
      regionA.clipId !== regionB.clipId ||
      regionA.isProcessing !== regionB.isProcessing
    ) {
      return false;
    }
  }

  return true;
}

export const useTimelineStore = create<TimelineStore>()(
  temporal(
    (...args) => ({
      ...createClipSlice(...args),
      ...createColorSlice(...args),
    }),
    {
      // Track both clips and colorRegions for undo/redo
      partialize: (state) => ({
        clips: state.clips,
        colorRegions: state.colorRegions.map((r) => ({
          id: r.id,
          clipId: r.clipId,
          isProcessing: r.isProcessing,
        })),
      }),
      equality: shallowEqualColorRegions,
      limit: 50,
    },
  ),
);
