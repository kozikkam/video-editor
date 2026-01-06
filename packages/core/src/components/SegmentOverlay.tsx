import { useEffect, useRef } from 'react';
import { ColorIsolationRenderer } from '../lib/colorIsolation/colorIsolationRenderer';
import { getMaskForTime } from '../lib/tracking/clipProcessor';
import { cn } from '../lib/utils';
import { useSegmentationStore } from '../stores/segmentationStore';
import { useTimelineStore } from '../stores/timelineStore';
import type { MaskData } from '../types';

interface SegmentOverlayProps {
  className?: string;
  width: number;
  height: number;
  clipId: string | null;
  video: HTMLVideoElement | null;
  currentSourceTime: number;
}

export function SegmentOverlay({
  className,
  width,
  height,
  clipId,
  video,
  currentSourceTime,
}: SegmentOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ColorIsolationRenderer | null>(null);

  const colorRegions = useTimelineStore((s) => s.colorRegions);
  const previewMask = useSegmentationStore((s) => s.previewMask);
  const isActive = useSegmentationStore((s) => s.isActive);

  const clipRegions = clipId ? colorRegions.filter((r) => r.clipId === clipId) : [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      rendererRef.current = new ColorIsolationRenderer(canvas);
    } catch (e) {
      console.error('Failed to initialize ColorIsolationRenderer:', e);
    }

    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    function renderOnEachFrame() {
      const renderer = rendererRef.current;
      if (!renderer || !video || video.videoWidth === 0) return;

      renderer.updateVideo(video);

      // If in preview mode, show mask overlay
      if (isActive && previewMask) {
        renderer.updateMask(previewMask);
        renderer.renderPreview();
        return;
      }

      // If there are color regions, get the appropriate mask for current time
      if (clipRegions.length > 0) {
        // Combine masks from all regions for current frame
        const masks: MaskData[] = [];

        for (const region of clipRegions) {
          if (region.frameMasks.length > 0) {
            const frameMask = getMaskForTime(region.frameMasks, currentSourceTime);
            if (frameMask) {
              masks.push(frameMask.mask);
            }
          }
        }

        if (masks.length > 0) {
          const combinedMask = combineMasks(masks);
          renderer.updateMask(combinedMask);
          renderer.render();
          return;
        }
      }

      // No effect or preview - clear
      renderer.updateMask(null);
      renderer.clear();
    }

    renderOnEachFrame();
  }, [video, isActive, previewMask, clipRegions, currentSourceTime]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={cn('absolute inset-0 pointer-events-none', className)}
      style={{ width, height }}
    />
  );
}

// Combine multiple masks using OR operation
function combineMasks(masks: MaskData[]): MaskData | null {
  if (masks.length === 0) return null;
  if (masks.length === 1) return masks[0];

  // All masks should have the same dimensions
  const first = masks[0];
  const combined = new Uint8Array(first.data.length);

  for (const mask of masks) {
    for (let i = 0; i < mask.data.length; i++) {
      if (mask.data[i] > 0) {
        combined[i] = 1;
      }
    }
  }

  return {
    data: combined,
    width: first.width,
    height: first.height,
  };
}
