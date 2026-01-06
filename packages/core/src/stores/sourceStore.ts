import { create } from 'zustand';
import { generateId } from '../lib/utils';
import type { VideoSource } from '../types';

interface VideoSourceStore {
  sources: Map<string, VideoSource>;
  addSource: (file: File) => Promise<string>;
  clearSources: () => void;
  getSource: (sourceId: string) => VideoSource | undefined;
}

interface VideoMetadata {
  durationInSeconds: number;
  widthInPixels: number;
  heightInPixels: number;
  frameRate: number;
}

const METADATA_TIMEOUT_MS = 10000; // 10 second timeout
const DEFAULT_FRAME_RATE = 30;
const FRAME_RATE_SAMPLE_COUNT = 10;

/**
 * Detects video frame rate using requestVideoFrameCallback.
 * Plays the video briefly to sample frame intervals.
 */
async function detectFrameRate(video: HTMLVideoElement): Promise<number> {
  // Check if requestVideoFrameCallback is supported
  if (!('requestVideoFrameCallback' in video)) {
    return DEFAULT_FRAME_RATE;
  }

  return new Promise((resolve) => {
    const samples: number[] = [];
    let lastMediaTime = 0;
    let callbackId: number;

    const timeoutId = setTimeout(() => {
      video.cancelVideoFrameCallback(callbackId);
      video.pause();
      resolve(DEFAULT_FRAME_RATE);
    }, 2000); // 2 second timeout for frame rate detection

    const callback: VideoFrameRequestCallback = (_now, metadata) => {
      if (lastMediaTime > 0 && metadata.mediaTime > lastMediaTime) {
        samples.push(metadata.mediaTime - lastMediaTime);
      }
      lastMediaTime = metadata.mediaTime;

      if (samples.length >= FRAME_RATE_SAMPLE_COUNT) {
        clearTimeout(timeoutId);
        video.pause();

        const avgInterval = samples.reduce((a, b) => a + b, 0) / samples.length;
        const detectedFps = Math.round(1 / avgInterval);

        // Clamp to reasonable range (10-120 fps)
        const clampedFps = Math.max(10, Math.min(120, detectedFps));
        resolve(clampedFps);
      } else {
        callbackId = video.requestVideoFrameCallback(callback);
      }
    };

    callbackId = video.requestVideoFrameCallback(callback);
    video.muted = true;
    video.play().catch(() => {
      clearTimeout(timeoutId);
      resolve(DEFAULT_FRAME_RATE);
    });
  });
}

async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  const video = document.createElement('video');
  video.preload = 'auto'; // Need more than metadata for frame rate detection
  video.muted = true;

  const objectUrl = URL.createObjectURL(file);

  const cleanup = () => {
    video.pause();
    video.onloadedmetadata = null;
    video.onerror = null;
    video.src = '';
    video.load();
    URL.revokeObjectURL(objectUrl);
  };

  try {
    // Wait for metadata to load
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            `Video metadata extraction timed out after ${METADATA_TIMEOUT_MS / 1000}s. The file may be corrupted or not a valid video.`,
          ),
        );
      }, METADATA_TIMEOUT_MS);

      video.onloadedmetadata = () => {
        clearTimeout(timeoutId);
        resolve();
      };

      video.onerror = () => {
        clearTimeout(timeoutId);
        reject(
          new Error('Failed to load video. The file may be corrupted or in an unsupported format.'),
        );
      };

      video.src = objectUrl;
    });

    const duration = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;

    // Validate metadata
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Invalid video: could not determine duration. The file may be corrupted.');
    }

    if (width <= 0 || height <= 0) {
      throw new Error('Invalid video: could not determine dimensions. The file may be corrupted.');
    }

    // Detect frame rate (plays video briefly)
    const frameRate = await detectFrameRate(video);

    cleanup();

    return {
      durationInSeconds: duration,
      widthInPixels: width,
      heightInPixels: height,
      frameRate,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

export const useSourceStore = create<VideoSourceStore>((set, get) => ({
  sources: new Map(),

  addSource: async (file: File) => {
    const id = generateId();
    const objectUrl = URL.createObjectURL(file);

    try {
      const metadata = await extractVideoMetadata(file);

      const source: VideoSource = {
        id,
        file,
        objectUrl,
        durationInSeconds: metadata.durationInSeconds,
        fileName: file.name,
        widthInPixels: metadata.widthInPixels,
        heightInPixels: metadata.heightInPixels,
        frameRate: metadata.frameRate,
      };

      set((state) => {
        const newSources = new Map(state.sources);
        newSources.set(id, source);
        return { sources: newSources };
      });

      return id;
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  },

  clearSources: () => {
    for (const source of get().sources.values()) {
      URL.revokeObjectURL(source.objectUrl);
    }
    set({ sources: new Map() });
  },

  getSource: (sourceId: string) => {
    return get().sources.get(sourceId);
  },
}));
