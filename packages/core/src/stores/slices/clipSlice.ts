import type { StateCreator } from 'zustand';
import { generateId } from '../../lib/utils';
import type { TimelineClip } from '../../types';
import { usePlaybackStore } from '../playbackStore';
import { useSourceStore } from '../sourceStore';
import type { ColorSlice } from './colorSlice';

const MIN_PIXELS_PER_SECOND = 10;
const MAX_PIXELS_PER_SECOND = 200;

export interface ClipSlice {
  clips: TimelineClip[];
  selectedClipId: string | null;
  pixelsPerSecond: number;

  getDuration: () => number;
  addClip: (sourceId: string) => void;
  removeClip: (clipId: string) => void;
  reorderClips: (activeId: string, overId: string) => void;
  trimClipStart: (clipId: string, newSourceInPointSeconds: number) => void;
  trimClipEnd: (clipId: string, newSourceOutPointSeconds: number) => void;
  splitClip: (clipId: string, atTimelineTimeSeconds: number) => void;
  selectClip: (clipId: string | null) => void;
  getClip: (clipId: string) => TimelineClip | undefined;
  getClips: () => TimelineClip[];
  setPixelsPerSecond: (pixelsPerSecond: number) => void;
  clearClips: () => void;
}

function getClipDuration(clip: TimelineClip): number {
  return clip.sourceOutPointSeconds - clip.sourceInPointSeconds;
}

function recalculatePositions(clips: TimelineClip[]): TimelineClip[] {
  let currentPosition = 0;
  return clips.map((clip) => {
    const updatedClip = { ...clip, timelinePositionSeconds: currentPosition };
    currentPosition += getClipDuration(clip);
    return updatedClip;
  });
}

function calculateTotalDuration(clips: TimelineClip[]): number {
  return clips.reduce((total, clip) => total + getClipDuration(clip), 0);
}

/**
 * Gets the source time for the current playhead position within a specific clip.
 * Returns null if the playhead is not within the clip.
 */
function getSourceTimeForPlayhead(
  clip: TimelineClip,
  currentTime: number,
): number | null {
  const clipDuration = getClipDuration(clip);
  const clipEnd = clip.timelinePositionSeconds + clipDuration;

  if (currentTime < clip.timelinePositionSeconds || currentTime > clipEnd) {
    return null;
  }

  const offsetInClip = currentTime - clip.timelinePositionSeconds;
  return clip.sourceInPointSeconds + offsetInClip;
}

/**
 * Adjusts the playhead position when trimming to maintain the same source frame.
 * This keeps the video preview stable when the user trims parts they're not viewing.
 */
function adjustPlayheadForTrim(
  clipId: string,
  oldClips: TimelineClip[],
  newClips: TimelineClip[],
): void {
  const { currentTime, setCurrentTime } = usePlaybackStore.getState();
  
  const oldClip = oldClips.find((c) => c.id === clipId);
  const newClip = newClips.find((c) => c.id === clipId);
  
  if (!oldClip || !newClip) return;

  // Get the source time we were viewing before the trim
  const sourceTimeBeforeTrim = getSourceTimeForPlayhead(oldClip, currentTime);
  
  // If playhead wasn't in this clip, no adjustment needed
  if (sourceTimeBeforeTrim === null) return;

  // Check if the source time we were viewing is still within the new clip bounds
  const isStillInBounds =
    sourceTimeBeforeTrim >= newClip.sourceInPointSeconds &&
    sourceTimeBeforeTrim <= newClip.sourceOutPointSeconds;

  if (isStillInBounds) {
    // Calculate new timeline time that maps to the same source time
    const newTimelineTime =
      newClip.timelinePositionSeconds +
      (sourceTimeBeforeTrim - newClip.sourceInPointSeconds);
    
    // Only adjust if there's a meaningful difference
    if (Math.abs(newTimelineTime - currentTime) > 0.001) {
      setCurrentTime(newTimelineTime);
    }
  } else {
    // Source time was trimmed away - clamp to the nearest valid position
    if (sourceTimeBeforeTrim < newClip.sourceInPointSeconds) {
      // Trimmed from start - move to new clip start
      setCurrentTime(newClip.timelinePositionSeconds);
    } else {
      // Trimmed from end - move to new clip end
      const newClipDuration = getClipDuration(newClip);
      setCurrentTime(newClip.timelinePositionSeconds + newClipDuration);
    }
  }
}

function clampTrimStart(
  clip: TimelineClip,
  newSourceInPointSeconds: number,
): { sourceInPointSeconds: number } {
  const clampedInPoint = Math.max(
    0,
    Math.min(newSourceInPointSeconds, clip.sourceOutPointSeconds - 0.1),
  );
  return { sourceInPointSeconds: clampedInPoint };
}

function clampTrimEnd(
  clip: TimelineClip,
  newSourceOutPointSeconds: number,
  sourceDuration: number,
): number {
  return Math.min(
    sourceDuration,
    Math.max(newSourceOutPointSeconds, clip.sourceInPointSeconds + 0.1),
  );
}

function createSplitClips(
  clip: TimelineClip,
  atTimelineTimeSeconds: number,
): [TimelineClip, TimelineClip] | null {
  const clipDuration = getClipDuration(clip);
  const clipEnd = clip.timelinePositionSeconds + clipDuration;

  if (atTimelineTimeSeconds <= clip.timelinePositionSeconds || atTimelineTimeSeconds >= clipEnd) {
    return null;
  }

  const splitOffset = atTimelineTimeSeconds - clip.timelinePositionSeconds;
  const sourceSplitTime = clip.sourceInPointSeconds + splitOffset;

  const firstClip: TimelineClip = {
    ...clip,
    sourceOutPointSeconds: sourceSplitTime,
    trimmed: { startSeconds: clip.trimmed.startSeconds, endSeconds: 0 },
  };

  const secondClip: TimelineClip = {
    ...clip,
    id: generateId(),
    sourceInPointSeconds: sourceSplitTime,
    timelinePositionSeconds: atTimelineTimeSeconds,
    trimmed: { startSeconds: 0, endSeconds: clip.trimmed.endSeconds },
  };

  return [firstClip, secondClip];
}

export const createClipSlice: StateCreator<ClipSlice & ColorSlice, [], [], ClipSlice> = (
  set,
  get,
) => ({
  clips: [],
  selectedClipId: null,
  pixelsPerSecond: 50,

  getDuration: () => calculateTotalDuration(get().clips),
  addClip: (sourceId: string) => {
    const source = useSourceStore.getState().getSource(sourceId);
    if (!source) return;

    const newClip: TimelineClip = {
      id: generateId(),
      sourceId,
      sourceInPointSeconds: 0,
      sourceOutPointSeconds: source.durationInSeconds,
      timelinePositionSeconds: 0,
      trimmed: { startSeconds: 0, endSeconds: 0 },
    };

    set((state) => {
      const updatedClips = [...state.clips, newClip];
      return { clips: recalculatePositions(updatedClips) };
    });
  },
  removeClip: (clipId: string) => {
    set((state) => {
      const filteredClips = state.clips.filter((c) => c.id !== clipId);
      const updatedClips = recalculatePositions(filteredClips);
      return {
        clips: updatedClips,
        selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
      };
    });
  },
  reorderClips: (activeId: string, overId: string) => {
    if (activeId === overId) return;

    set((state) => {
      const oldIndex = state.clips.findIndex((c) => c.id === activeId);
      const newIndex = state.clips.findIndex((c) => c.id === overId);

      if (oldIndex === -1 || newIndex === -1) return state;

      const newClips = [...state.clips];
      const [movedClip] = newClips.splice(oldIndex, 1);
      newClips.splice(newIndex, 0, movedClip);

      return { clips: recalculatePositions(newClips) };
    });
  },
  trimClipStart: (clipId: string, newSourceInPointSeconds: number) => {
    set((state) => {
      const oldClips = state.clips;
      const updatedClips = recalculatePositions(
        state.clips.map((clip) => {
          if (clip.id !== clipId) return clip;

          const { sourceInPointSeconds: clampedInPoint } = clampTrimStart(
            clip,
            newSourceInPointSeconds,
          );

          const minAllowedInPoint = clip.sourceInPointSeconds - clip.trimmed.startSeconds;
          const finalInPoint = Math.max(minAllowedInPoint, clampedInPoint);

          const delta = finalInPoint - clip.sourceInPointSeconds;

          if (delta === 0) return clip;

          return {
            ...clip,
            sourceInPointSeconds: finalInPoint,
            trimmed: {
              ...clip.trimmed,
              startSeconds: Math.max(0, clip.trimmed.startSeconds + delta),
            },
          };
        }),
      );
      adjustPlayheadForTrim(clipId, oldClips, updatedClips);
      return { clips: updatedClips };
    });
  },
  trimClipEnd: (clipId: string, newSourceOutPointSeconds: number) => {
    set((state) => {
      const oldClips = state.clips;
      const updatedClips = recalculatePositions(
        state.clips.map((clip) => {
          if (clip.id !== clipId) return clip;

          const source = useSourceStore.getState().getSource(clip.sourceId);
          if (!source) return clip;

          const clampedOutPoint = clampTrimEnd(
            clip,
            newSourceOutPointSeconds,
            source.durationInSeconds,
          );

          const maxAllowedOutPoint = clip.sourceOutPointSeconds + clip.trimmed.endSeconds;
          const finalOutPoint = Math.min(maxAllowedOutPoint, clampedOutPoint);

          const delta = clip.sourceOutPointSeconds - finalOutPoint;

          if (delta === 0) return clip;

          return {
            ...clip,
            sourceOutPointSeconds: finalOutPoint,
            trimmed: {
              ...clip.trimmed,
              endSeconds: Math.max(0, clip.trimmed.endSeconds + delta),
            },
          };
        }),
      );
      adjustPlayheadForTrim(clipId, oldClips, updatedClips);
      return { clips: updatedClips };
    });
  },
  splitClip: (clipId: string, atTimelineTimeSeconds: number) => {
    const clip = get().clips.find((c) => c.id === clipId);
    if (!clip) return;

    const splitResult = createSplitClips(clip, atTimelineTimeSeconds);
    if (!splitResult) return;

    const [firstClip, secondClip] = splitResult;

    set((state) => {
      const newClips = state.clips.flatMap((c) =>
        c.id === clipId ? [firstClip, secondClip] : [c],
      );
      return { clips: recalculatePositions(newClips) };
    });
  },
  selectClip: (clipId: string | null) => {
    set({ selectedClipId: clipId });
  },
  getClip: (clipId: string) => {
    return get().clips.find((c) => c.id === clipId);
  },
  getClips: () => {
    return get().clips;
  },
  setPixelsPerSecond: (pixelsPerSecond: number) => {
    set({ pixelsPerSecond: Math.max(MIN_PIXELS_PER_SECOND, Math.min(MAX_PIXELS_PER_SECOND, pixelsPerSecond)) });
  },
  clearClips: () => {
    set({ clips: [], selectedClipId: null });
  },
});

