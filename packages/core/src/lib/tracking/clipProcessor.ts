import type { FrameMask } from '../../types';
import { loadModels as loadSAM, segment as runSegment } from '../sam/samModel';
import {
  type BoundingBox,
  type DetectedObject,
  detectObjects,
  findObjectAtPoint,
  getBoxCenter,
  loadObjectDetector,
  trackObject,
} from './objectTracker';

export interface ProcessingProgress {
  currentFrame: number;
  totalFrames: number;
  progress: number;
  frameMask?: FrameMask;
}

export type ProgressCallback = (progress: ProcessingProgress) => void;

/**
 * Extracts a frame from a video at a specific time.
 * 
 * @param video - The video element.
 * @param timeSeconds - The time in seconds to extract the frame from.
 * @returns The image data of the frame.
 */
async function extractFrame(
  video: HTMLVideoElement,
  timeSeconds: number,
): Promise<ImageData> {
  return new Promise((resolve) => {
    video.currentTime = timeSeconds;

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);

      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };

    video.addEventListener('seeked', onSeeked);
  });
}

/**
 * Processes an entire clip: detects, tracks, and segments the object through all frames.
 * 
 * @param video - The video element.
 * @param startTimeSeconds - The start time in seconds.
 * @param endTimeSeconds - The end time in seconds.
 * @param clickX - The x coordinate of the click point.
 * @param clickY - The y coordinate of the click point.
 * @param fps - The frames per second.
 * @param onProgress - The callback to call with progress updates.
 * @returns The frame masks.
 */
export async function processClip(
  video: HTMLVideoElement,
  startTimeSeconds: number,
  endTimeSeconds: number,
  clickX: number,
  clickY: number,
  fps: number = 10,
  onProgress?: ProgressCallback,
): Promise<FrameMask[]> {
  await Promise.all([loadObjectDetector(), loadSAM()]);

  const frameMasks: FrameMask[] = [];
  const frameInterval = 1 / fps;
  const totalFrames = Math.ceil((endTimeSeconds - startTimeSeconds) * fps);

  let previousBox: BoundingBox | null = null;

  for (let i = 0; i < totalFrames; i++) {
    const time = startTimeSeconds + i * frameInterval;

    try {
      const frameData = await extractFrame(video, time);
      const objects = detectObjects(frameData);

      // First frame: find object at click point; subsequent: track via IoU
      const tracked: DetectedObject | null = previousBox
        ? trackObject(previousBox, objects)
        : findObjectAtPoint(objects, clickX, clickY);
      const center = tracked
        ? getBoxCenter(tracked.box)
        : previousBox
          ? getBoxCenter(previousBox)
          : { x: clickX, y: clickY };

      if (tracked) previousBox = tracked.box;

      const mask = await runSegment(frameData, center.x, center.y);

      if (mask) {
        const frameMask: FrameMask = { frameTimeSeconds: time, mask };
        frameMasks.push(frameMask);
        onProgress?.({ currentFrame: i + 1, totalFrames, progress: (i + 1) / totalFrames, frameMask });
      }
    } catch (error) {
      console.error(`Error processing frame at ${time}s:`, error);
    }
  }

  return frameMasks;
}

/**
 * Gets the appropriate mask for a given time.
 * 
 * @param frameMasks - The frame masks.
 * @param timeSeconds - The time in seconds.
 * @returns The frame mask.
 */
export function getMaskForTime(
  frameMasks: FrameMask[],
  timeSeconds: number,
): FrameMask | null {
  if (frameMasks.length === 0) return null;
  if (frameMasks.length === 1) return frameMasks[0];

  // Find the closest frame mask
  let closest = frameMasks[0];
  let closestDiff = Math.abs(timeSeconds - closest.frameTimeSeconds);

  for (const fm of frameMasks) {
    const diff = Math.abs(timeSeconds - fm.frameTimeSeconds);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = fm;
    }
  }

  return closest;
}

