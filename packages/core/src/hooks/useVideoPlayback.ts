import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getActiveClipAtTime } from '../lib/utils';
import { usePlaybackStore } from '../stores/playbackStore';
import { useSourceStore } from '../stores/sourceStore';
import { useTimelineStore } from '../stores/timelineStore';

interface UseVideoPlaybackOptions {
  getVideoRef: (sourceId: string) => HTMLVideoElement | null;
}

interface UseVideoPlaybackResult {
  currentTimeSeconds: number;
  totalDurationSeconds: number;
  isPlaying: boolean;
  isEnded: boolean;
  hasContent: boolean;
  activeSourceId: string | null;
  handleTogglePlay: () => void;
  handleRestart: () => void;
  seek: (time: number) => void;
  seekRelative: (delta: number) => void;
}

const END_THRESHOLD_SECONDS = 0.05;
const CLIP_TRANSITION_OFFSET_SECONDS = 0.01;
const PLAY_AFTER_SEEK_DELAY_MS = 50;
const SYNC_THRESHOLD_SECONDS = 0.05;

export function useVideoPlayback({ getVideoRef }: UseVideoPlaybackOptions): UseVideoPlaybackResult {
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [isEnded, setIsEnded] = useState(false);
  const previousClipIdRef = useRef<string | null>(null);
  const previousSourceTimeRef = useRef<number | null>(null);
  const previousSourceIdRef = useRef<string | null>(null);

  // Store subscriptions
  const currentTimeSeconds = usePlaybackStore((state) => state.currentTime);
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const toggle = usePlaybackStore((state) => state.toggle);
  const pause = usePlaybackStore((state) => state.pause);
  const seek = usePlaybackStore((state) => state.seek);
  const seekRelative = usePlaybackStore((state) => state.seekRelative);
  const setCurrentTime = usePlaybackStore((state) => state.setCurrentTime);

  const clips = useTimelineStore((state) => state.clips);
  const getDuration = useTimelineStore((state) => state.getDuration);

  const getSource = useSourceStore((state) => state.getSource);

  const totalDurationSeconds = getDuration();
  const hasContent = clips.length > 0;

  const activeClip = useMemo(
    () => getActiveClipAtTime(currentTimeSeconds, clips, getSource),
    [currentTimeSeconds, clips, getSource],
  );

  // Video Sync Effect
  useEffect(() => {
    // No active clip - playhead is beyond content or no clips exist
    if (!activeClip) {
      // Pause any playing video
      if (previousSourceIdRef.current) {
        const prevVideo = getVideoRef(previousSourceIdRef.current);
        if (prevVideo) prevVideo.pause();
      }

      if (isPlaying) {
        setIsEnded(true);
        pause();
      }

      previousClipIdRef.current = null;
      previousSourceTimeRef.current = null;
      return;
    }

    const { currentSourceTimeSeconds, clip, source } = activeClip;
    const video = getVideoRef(source.id);

    if (!video) return;

    // Switch active source - pause old video, show new one
    const sourceChanged = previousSourceIdRef.current !== source.id;
    if (sourceChanged) {
      if (previousSourceIdRef.current) {
        const prevVideo = getVideoRef(previousSourceIdRef.current);
        if (prevVideo) prevVideo.pause();
      }
      setActiveSourceId(source.id);
      previousSourceIdRef.current = source.id;
    }

    // Sync video to correct source time when:
    // 1. Clip changed (transitioned to different clip)
    // 2. Source changed
    // 3. Expected source time changed significantly (e.g., after trim/reorder)
    const clipChanged = previousClipIdRef.current !== clip.id;
    const expectedSourceTimeChanged =
      previousSourceTimeRef.current !== null &&
      Math.abs(previousSourceTimeRef.current - currentSourceTimeSeconds) > SYNC_THRESHOLD_SECONDS;
    const videoOutOfSync =
      Math.abs(video.currentTime - currentSourceTimeSeconds) > SYNC_THRESHOLD_SECONDS;

    if (
      sourceChanged ||
      clipChanged ||
      (!isPlaying && (expectedSourceTimeChanged || videoOutOfSync))
    ) {
      video.currentTime = currentSourceTimeSeconds;
    }

    previousClipIdRef.current = clip.id;
    previousSourceTimeRef.current = currentSourceTimeSeconds;

    // Animation frame loop for smooth time updates
    let animationFrameId: number | undefined;

    const updateTime = () => {
      if (!video || video.paused) return;

      const sourceTime = video.currentTime;
      const duration = useTimelineStore.getState().getDuration();
      const timelinePosition =
        clip.timelinePositionSeconds + (sourceTime - clip.sourceInPointSeconds);

      const clipEnded = sourceTime >= clip.sourceOutPointSeconds - END_THRESHOLD_SECONDS;

      if (clipEnded) {
        const clipEndOnTimeline =
          clip.timelinePositionSeconds + (clip.sourceOutPointSeconds - clip.sourceInPointSeconds);
        const isLastClip = clipEndOnTimeline >= duration - END_THRESHOLD_SECONDS;

        if (isLastClip) {
          setIsEnded(true);
          pause();
          setCurrentTime(duration);
        } else {
          // Clips are contiguous - next clip starts exactly where this one ends
          setCurrentTime(clipEndOnTimeline + CLIP_TRANSITION_OFFSET_SECONDS);
        }
        return;
      }

      setCurrentTime(timelinePosition);
      animationFrameId = requestAnimationFrame(updateTime);
    };

    if (isPlaying) {
      setIsEnded(false);
      video.play().catch(() => pause());
      animationFrameId = requestAnimationFrame(updateTime);
    } else {
      video.pause();
    }

    return () => {
      if (animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [activeClip, isPlaying, getVideoRef, pause, setCurrentTime]);

  // Reset isEnded when seeking backwards
  useEffect(() => {
    const notAtEnd = currentTimeSeconds < totalDurationSeconds - 0.1;
    if (notAtEnd) {
      setIsEnded(false);
    }
  }, [currentTimeSeconds, totalDurationSeconds]);

  const handleRestart = useCallback(() => {
    seek(0);
    setIsEnded(false);
    setTimeout(() => {
      usePlaybackStore.getState().play();
    }, PLAY_AFTER_SEEK_DELAY_MS);
  }, [seek]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      toggle();
      return;
    }

    // With contiguous clips, if we're at a valid position just toggle
    const currentActive = getActiveClipAtTime(currentTimeSeconds, clips, getSource);
    if (currentActive) {
      toggle();
      return;
    }

    // If no active clip and we have clips, start from beginning
    if (clips.length > 0) {
      seek(0);
      setIsEnded(false);
      setTimeout(() => {
        usePlaybackStore.getState().play();
      }, PLAY_AFTER_SEEK_DELAY_MS);
    }
  }, [isPlaying, currentTimeSeconds, clips, getSource, toggle, seek]);

  return {
    currentTimeSeconds,
    totalDurationSeconds,
    isPlaying,
    isEnded,
    hasContent,
    activeSourceId,
    handleTogglePlay,
    handleRestart,
    seek,
    seekRelative,
  };
}
