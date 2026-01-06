import { useEffect } from 'react';
import { getActiveClipAtTime } from '../lib/utils';
import { usePlaybackStore } from '../stores/playbackStore';
import { useSourceStore } from '../stores/sourceStore';
import { useTimelineStore } from '../stores/timelineStore';

/** Delay before playing after seeking (ms) */
const PLAY_AFTER_SEEK_DELAY_MS = 50;

/** Seek amount in seconds for arrow keys */
const SEEK_AMOUNT_SECONDS = 1;

/** Seek amount in seconds for arrow keys with shift */
const SEEK_AMOUNT_SHIFT_SECONDS = 5;

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore when typing in inputs
      if (isTypingInInput(event)) return;

      const action = getKeyboardAction(event);
      if (action) {
        event.preventDefault();
        action();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

function isTypingInInput(event: KeyboardEvent): boolean {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
}

function getKeyboardAction(event: KeyboardEvent): (() => void) | null {
  switch (event.code) {
    case 'Space':
      return handleSpaceKey;
    case 'ArrowLeft':
      return () => handleArrowKey(-1, event.shiftKey);
    case 'ArrowRight':
      return () => handleArrowKey(1, event.shiftKey);
    case 'Home':
      return handleHomeKey;
    case 'End':
      return handleEndKey;
    case 'Delete':
    case 'Backspace':
      return handleDeleteKey;
    case 'KeyS':
      if (!event.metaKey && !event.ctrlKey) {
        return handleSplitKey;
      }
      return null;
    case 'KeyZ':
      if (event.metaKey || event.ctrlKey) {
        return event.shiftKey ? handleRedo : handleUndo;
      }
      return null;
    case 'KeyY':
      if (event.ctrlKey) {
        return handleRedo;
      }
      return null;
    default:
      return null;
  }
}

function handleSpaceKey(): void {
  const { isPlaying, toggle, seek, play } = usePlaybackStore.getState();
  const { clips } = useTimelineStore.getState();
  const { currentTime } = usePlaybackStore.getState();
  const { getSource } = useSourceStore.getState();

  // If playing, just pause
  if (isPlaying) {
    toggle();
    return;
  }

  // No clips - nothing to play
  if (clips.length === 0) return;

  // Check if there's a clip at current position
  const activeClip = getActiveClipAtTime(currentTime, clips, getSource);
  if (activeClip) {
    toggle();
    return;
  }

  // No clip at current position (e.g., playhead is past end)
  seek(0);
  setTimeout(() => play(), PLAY_AFTER_SEEK_DELAY_MS);
}

function handleArrowKey(direction: 1 | -1, shiftKey: boolean): void {
  const amount = shiftKey ? SEEK_AMOUNT_SHIFT_SECONDS : SEEK_AMOUNT_SECONDS;
  usePlaybackStore.getState().seekRelative(direction * amount);
}

function handleHomeKey(): void {
  usePlaybackStore.getState().seek(0);
}

function handleEndKey(): void {
  const duration = useTimelineStore.getState().getDuration();
  usePlaybackStore.getState().seek(duration);
}

function handleDeleteKey(): void {
  const { selectedClipId, removeClip } = useTimelineStore.getState();
  if (selectedClipId) {
    removeClip(selectedClipId);
  }
}

function handleSplitKey(): void {
  const { selectedClipId, splitClip } = useTimelineStore.getState();
  const { currentTime } = usePlaybackStore.getState();
  if (selectedClipId) {
    splitClip(selectedClipId, currentTime);
  }
}

function handleUndo(): void {
  useTimelineStore.temporal.getState().undo();
}

function handleRedo(): void {
  useTimelineStore.temporal.getState().redo();
}
