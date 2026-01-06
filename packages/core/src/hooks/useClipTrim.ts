import { type PointerEvent, useCallback, useRef, useState } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import type { TimelineClip } from '../types';

type TrimMode = 'trim-start' | 'trim-end' | null;

interface TrimState {
  mode: TrimMode;
  startX: number;
  originalInPoint: number;
  originalOutPoint: number;
}

interface UseClipTrimOptions {
  clip: TimelineClip;
  pixelsPerSecond: number;
  onSelect: () => void;
}

interface UseClipTrimResult {
  trimMode: TrimMode;
  displayInPoint: number;
  displayOutPoint: number;
  displayTrimmedStart: number;
  displayTrimmedEnd: number;
  handleTrimPointerDown: (e: PointerEvent<HTMLDivElement>, mode: 'trim-start' | 'trim-end') => void;
  handleTrimPointerMove: (e: PointerEvent<HTMLDivElement>, sourceDuration: number) => void;
  handleTrimPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  finishTrim: () => void;
}

export function useClipTrim({
  clip,
  pixelsPerSecond,
  onSelect,
}: UseClipTrimOptions): UseClipTrimResult {
  const trimClipStart = useTimelineStore((state) => state.trimClipStart);
  const trimClipEnd = useTimelineStore((state) => state.trimClipEnd);

  const [trimState, setTrimState] = useState<TrimState | null>(null);
  const [pendingTrim, setPendingTrim] = useState<{ inPoint: number; outPoint: number } | null>(
    null,
  );

  const trimStateRef = useRef<TrimState | null>(null);
  const pendingTrimRef = useRef<{ inPoint: number; outPoint: number } | null>(null);

  trimStateRef.current = trimState;
  pendingTrimRef.current = pendingTrim;

  const handleTrimPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, mode: 'trim-start' | 'trim-end') => {
      event.preventDefault();
      event.stopPropagation();
      onSelect();

      event.currentTarget.setPointerCapture(event.pointerId);

      setTrimState({
        mode,
        startX: event.clientX,
        originalInPoint: clip.sourceInPointSeconds,
        originalOutPoint: clip.sourceOutPointSeconds,
      });

      setPendingTrim({
        inPoint: clip.sourceInPointSeconds,
        outPoint: clip.sourceOutPointSeconds,
      });
    },
    [clip, onSelect],
  );

  const handleTrimPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>, sourceDuration: number) => {
      const currentTrimState = trimStateRef.current;
      if (!currentTrimState) return;

      const deltaX = event.clientX - currentTrimState.startX;
      const deltaSeconds = deltaX / pixelsPerSecond;

      if (currentTrimState.mode === 'trim-start') {
        const newInPoint = Math.max(
          0,
          Math.min(
            currentTrimState.originalInPoint + deltaSeconds,
            currentTrimState.originalOutPoint - 0.1,
          ),
        );
        setPendingTrim({
          inPoint: newInPoint,
          outPoint: currentTrimState.originalOutPoint,
        });
      } else if (currentTrimState.mode === 'trim-end') {
        const newOutPoint = Math.max(
          currentTrimState.originalInPoint + 0.1,
          Math.min(currentTrimState.originalOutPoint + deltaSeconds, sourceDuration),
        );
        setPendingTrim({
          inPoint: currentTrimState.originalInPoint,
          outPoint: newOutPoint,
        });
      }
    },
    [pixelsPerSecond],
  );

  const finishTrim = useCallback(() => {
    const currentTrimState = trimStateRef.current;
    const currentPendingTrim = pendingTrimRef.current;

    if (currentTrimState && currentPendingTrim) {
      if (currentTrimState.mode === 'trim-start') {
        trimClipStart(clip.id, currentPendingTrim.inPoint);
      } else if (currentTrimState.mode === 'trim-end') {
        trimClipEnd(clip.id, currentPendingTrim.outPoint);
      }
    }

    setTrimState(null);
    setPendingTrim(null);
  }, [clip.id, trimClipStart, trimClipEnd]);

  const handleTrimPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
        event.currentTarget.blur();
      } catch {
        // Pointer may already be released
      }
      finishTrim();
    },
    [finishTrim],
  );

  const displayInPoint = pendingTrim?.inPoint ?? clip.sourceInPointSeconds;
  const displayOutPoint = pendingTrim?.outPoint ?? clip.sourceOutPointSeconds;

  const pendingTrimStartDelta = pendingTrim ? pendingTrim.inPoint - clip.sourceInPointSeconds : 0;
  const pendingTrimEndDelta = pendingTrim ? clip.sourceOutPointSeconds - pendingTrim.outPoint : 0;

  // Math.max(0, ...) on the result, not delta - allows shrinking trimmed region when restoring
  const displayTrimmedStart = Math.max(0, clip.trimmed.startSeconds + pendingTrimStartDelta);
  const displayTrimmedEnd = Math.max(0, clip.trimmed.endSeconds + pendingTrimEndDelta);

  return {
    trimMode: trimState?.mode ?? null,
    displayInPoint,
    displayOutPoint,
    displayTrimmedStart,
    displayTrimmedEnd,
    handleTrimPointerDown,
    handleTrimPointerMove,
    handleTrimPointerUp,
    finishTrim,
  };
}
