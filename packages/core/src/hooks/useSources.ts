import { useCallback } from 'react';
import { usePlaybackStore } from '../stores/playbackStore';
import { useSourceStore } from '../stores/sourceStore';
import { useTimelineStore } from '../stores/timelineStore';

/**
 * Hook for loading and removing video sources.
 * Uses getState() internally to avoid unnecessary re-renders.
 */
export function useSources() {
  const loadVideo = useCallback(async (file: File) => {
    try {
      const sourceId = await useSourceStore.getState().addSource(file);

      // Only reset playhead if this is the first clip
      const currentClips = useTimelineStore.getState().clips;
      if (currentClips.length === 0) {
        usePlaybackStore.getState().seek(0);
      }

      useTimelineStore.getState().addClip(sourceId);
      return sourceId;
    } catch (error) {
      console.error(`Failed to load video: ${file.name}`, error);
      throw error;
    }
  }, []);

  const removeVideo = useCallback(() => {
    usePlaybackStore.getState().seek(0);
    useTimelineStore.getState().clearClips();
    useSourceStore.getState().clearSources();
  }, []);

  return {
    loadVideo,
    removeVideo,
  };
}
