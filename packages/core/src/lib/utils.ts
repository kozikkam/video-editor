import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { v4 as uuidv4 } from 'uuid';
import type { ActiveClipPlaybackInfo, TimelineClip, VideoSource } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return uuidv4();
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

export function getActiveClipAtTime(
  timeSeconds: number,
  clips: TimelineClip[],
  getSource: (sourceId: string) => VideoSource | undefined,
): ActiveClipPlaybackInfo | null {
  const clip = clips.find((c) => {
    const clipDurationSeconds = c.sourceOutPointSeconds - c.sourceInPointSeconds;
    return (
      timeSeconds >= c.timelinePositionSeconds &&
      timeSeconds <= c.timelinePositionSeconds + clipDurationSeconds
    );
  });

  if (!clip) return null;

  const source = getSource(clip.sourceId);
  if (!source) return null;

  const offsetInClipSeconds = timeSeconds - clip.timelinePositionSeconds;
  const currentSourceTimeSeconds = clip.sourceInPointSeconds + offsetInClipSeconds;

  return { clip, currentSourceTimeSeconds, source };
}

function getClipTrimAmounts(clip: TimelineClip): { trimmedStart: number; trimmedEnd: number } {
  return {
    trimmedStart: clip.trimmed.startSeconds,
    trimmedEnd: clip.trimmed.endSeconds,
  };
}

/**
 * Calculates the visual pixel position for the playhead, accounting for
 * trim indicators that take up visual space but don't exist in the data model.
 * When the playhead is at the end of all clips, it stops at the last clip's
 * content end (not in the trimmed end region).
 */
export function calculatePlayheadVisualPosition(
  timelineTimeSeconds: number,
  clips: TimelineClip[],
  pixelsPerSecond: number,
): number {
  if (clips.length === 0) {
    return timelineTimeSeconds * pixelsPerSecond;
  }

  let visualOffset = 0;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const clipDuration = clip.sourceOutPointSeconds - clip.sourceInPointSeconds;
    const clipEnd = clip.timelinePositionSeconds + clipDuration;
    const { trimmedStart, trimmedEnd } = getClipTrimAmounts(clip);
    const isLastClip = i === clips.length - 1;

    if (timelineTimeSeconds >= clipEnd) {
      if (isLastClip) {
        // At or past the last clip - clamp to the end of clip content
        // Only add trimmedStart, not trimmedEnd, so playhead stays at content end
        visualOffset += trimmedStart;
        return (clipEnd + visualOffset) * pixelsPerSecond;
      }
      // Playhead is past this clip - add full visual footprint of trim regions
      visualOffset += trimmedStart + trimmedEnd;
    } else if (timelineTimeSeconds >= clip.timelinePositionSeconds) {
      // Playhead is in this clip - add trimmed start only
      visualOffset += trimmedStart;
      break;
    } else {
      break;
    }
  }

  return (timelineTimeSeconds + visualOffset) * pixelsPerSecond;
}

/**
 * Converts a visual pixel position back to timeline time, accounting for
 * trim indicators. This is the inverse of calculatePlayheadVisualPosition.
 */
export function calculateTimelineTimeFromVisualPosition(
  visualPixels: number,
  clips: TimelineClip[],
  pixelsPerSecond: number,
): number {
  if (clips.length === 0 || pixelsPerSecond === 0) {
    return visualPixels / pixelsPerSecond;
  }

  const visualSeconds = visualPixels / pixelsPerSecond;
  let accumulatedVisualTime = 0;
  let accumulatedTrimOffset = 0;

  for (const clip of clips) {
    const clipDuration = clip.sourceOutPointSeconds - clip.sourceInPointSeconds;
    const { trimmedStart, trimmedEnd } = getClipTrimAmounts(clip);

    const clipVisualStart = accumulatedVisualTime + trimmedStart;
    const clipVisualEnd = clipVisualStart + clipDuration;
    const clipVisualFullEnd = clipVisualEnd + trimmedEnd;

    if (visualSeconds < clipVisualStart) {
      // In the trimmed start region of this clip - clamp to clip start
      return clip.timelinePositionSeconds;
    }

    if (visualSeconds >= clipVisualStart && visualSeconds < clipVisualEnd) {
      // Within the clip content
      const offsetInClip = visualSeconds - clipVisualStart;
      return clip.timelinePositionSeconds + offsetInClip;
    }

    if (visualSeconds >= clipVisualEnd && visualSeconds < clipVisualFullEnd) {
      // In the trimmed end region - clamp to clip end
      return clip.timelinePositionSeconds + clipDuration;
    }

    // Past this clip entirely
    accumulatedVisualTime = clipVisualFullEnd;
    accumulatedTrimOffset += trimmedStart + trimmedEnd;
  }

  // Past all clips - return the end of the last clip
  const lastClip = clips[clips.length - 1];
  if (lastClip) {
    const lastClipDuration = lastClip.sourceOutPointSeconds - lastClip.sourceInPointSeconds;
    return lastClip.timelinePositionSeconds + lastClipDuration;
  }

  return visualSeconds - accumulatedTrimOffset;
}
