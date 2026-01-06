import { useCallback, useEffect, useRef } from 'react';
import { useSegmentationStore } from '../stores/segmentationStore';
import type { ActiveClipPlaybackInfo } from '../types';

interface UseSegmentationInteractionOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  videoRefs: React.RefObject<Map<string, HTMLVideoElement>>;
  activeSourceId: string | null;
  activeClipInfo: ActiveClipPlaybackInfo | null;
  videoDimensions: { width: number; height: number };
  imageDimensions: { width: number; height: number };
  currentTimeSeconds: number;
}

export function useSegmentationInteraction({
  containerRef,
  videoRefs,
  activeSourceId,
  activeClipInfo,
  videoDimensions,
  imageDimensions,
  currentTimeSeconds,
}: UseSegmentationInteractionOptions) {
  const debounceRef = useRef<number>(0);
  const lastEncodedRef = useRef<string | null>(null);

  const isActive = useSegmentationStore((s) => s.isActive);
  const isReady = useSegmentationStore((s) => s.isReady);
  const isProcessing = useSegmentationStore((s) => s.isProcessing);
  const setFrame = useSegmentationStore((s) => s.setFrame);
  const preview = useSegmentationStore((s) => s.preview);
  const clearPreview = useSegmentationStore((s) => s.clearPreview);
  const clear = useSegmentationStore((s) => s.clear);
  const requestProcessing = useSegmentationStore((s) => s.requestProcessing);

  const activeClipId = activeClipInfo?.clip.id ?? null;

  // Extract frame when segment mode activates or time changes
  useEffect(() => {
    if (!isActive || !isReady || !activeSourceId || !activeClipId) return;

    const video = videoRefs.current?.get(activeSourceId);
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const key = `${activeClipId}-${Math.round(currentTimeSeconds * 10)}`;
    if (lastEncodedRef.current === key) return;
    lastEncodedRef.current = key;

    const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
    setFrame(imageData, activeClipId);
  }, [isActive, isReady, activeSourceId, activeClipId, currentTimeSeconds, setFrame, videoRefs]);

  // Clear on deactivate
  useEffect(() => {
    if (!isActive) {
      clear();
      lastEncodedRef.current = null;
    }
  }, [isActive, clear]);

  // Convert mouse position to image coordinates
  const getImageCoords = useCallback(
    (event: React.MouseEvent): { x: number; y: number } | null => {
      const container = containerRef.current;
      if (!container || videoDimensions.width === 0 || imageDimensions.width === 0) return null;

      const rect = container.getBoundingClientRect();
      const offsetX = (rect.width - videoDimensions.width) / 2;
      const offsetY = (rect.height - videoDimensions.height) / 2;

      const displayX = event.clientX - rect.left - offsetX;
      const displayY = event.clientY - rect.top - offsetY;

      // Check bounds
      if (displayX < 0 || displayX > videoDimensions.width || displayY < 0 || displayY > videoDimensions.height) {
        return null;
      }

      // Scale to image coordinates
      const scaleX = imageDimensions.width / videoDimensions.width;
      const scaleY = imageDimensions.height / videoDimensions.height;

      return { x: displayX * scaleX, y: displayY * scaleY };
    },
    [containerRef, videoDimensions, imageDimensions],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!isActive || !isReady || isProcessing) return;
      if (!activeClipInfo || !activeSourceId) return;

      const coords = getImageCoords(event);
      if (!coords) return;

      const video = videoRefs.current?.get(activeSourceId);
      if (!video) return;

      const clip = activeClipInfo.clip;
      requestProcessing(video, clip.id, clip.sourceInPointSeconds, clip.sourceOutPointSeconds, coords.x, coords.y);
    },
    [isActive, isReady, isProcessing, activeClipInfo, activeSourceId, getImageCoords, requestProcessing, videoRefs],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!isActive || !isReady || isProcessing) return;

      const coords = getImageCoords(event);
      if (!coords) {
        clearPreview();
        return;
      }

      clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        preview(coords.x, coords.y);
      }, 50);
    },
    [isActive, isReady, isProcessing, getImageCoords, preview, clearPreview],
  );

  const handleMouseLeave = useCallback(() => {
    if (isActive) {
      clearTimeout(debounceRef.current);
      clearPreview();
    }
  }, [isActive, clearPreview]);

  const isInteractive = isActive && !isProcessing;

  return {
    isInteractive,
    handleClick: isInteractive ? handleClick : undefined,
    handleMouseMove: isInteractive ? handleMouseMove : undefined,
    handleMouseLeave: isInteractive ? handleMouseLeave : undefined,
  };
}

