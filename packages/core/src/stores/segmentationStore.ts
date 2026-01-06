import { create } from 'zustand';
import { isLoaded, loadModels, segment as runSegment } from '../lib/sam/samModel';
import { processClip } from '../lib/tracking/clipProcessor';
import { generateId } from '../lib/utils';
import type { ColorRegion, MaskData } from '../types';
import { useTimelineStore } from './timelineStore';

interface PendingProcess {
  video: HTMLVideoElement;
  clipId: string;
  startTime: number;
  endTime: number;
  clickX: number;
  clickY: number;
}

interface SegmentationStore {
  isActive: boolean;
  isReady: boolean;
  clipId: string | null;
  imageData: ImageData | null;
  previewMask: MaskData | null;
  isProcessing: boolean;
  processingRegionId: string | null;
  showModal: boolean;
  pendingProcess: PendingProcess | null;

  toggle: () => void;
  setFrame: (imageData: ImageData, clipId: string) => void;
  preview: (x: number, y: number) => Promise<void>;
  clearPreview: () => void;
  clear: () => void;
  requestProcessing: (
    video: HTMLVideoElement,
    clipId: string,
    startTime: number,
    endTime: number,
    clickX: number,
    clickY: number,
  ) => void;
  cancelProcessing: () => void;
  confirmProcessing: (fps: number) => Promise<void>;
}

let isPreviewProcessing = false;

export const useSegmentationStore = create<SegmentationStore>((set, get) => ({
  isActive: false,
  isReady: false,
  clipId: null,
  imageData: null,
  previewMask: null,
  isProcessing: false,
  processingRegionId: null,
  showModal: false,
  pendingProcess: null,

  toggle: () => {
    const active = !get().isActive;
    set({ isActive: active });

    if (active) {
      if (isLoaded()) {
        set({ isReady: true });
      } else {
        loadModels().then(() => set({ isReady: true }));
      }
    } else {
      set({ imageData: null, clipId: null, previewMask: null });
    }
  },
  setFrame: (imageData, clipId) => {
    set({ imageData, clipId });
  },
  preview: async (x, y) => {
    const { imageData } = get();
    if (!imageData || isPreviewProcessing) return;

    isPreviewProcessing = true;
    try {
      const mask = await runSegment(imageData, x, y);
      set({ previewMask: mask });
    } finally {
      isPreviewProcessing = false;
    }
  },
  clearPreview: () => set({ previewMask: null }),
  clear: () => set({ imageData: null, clipId: null, previewMask: null }),
  requestProcessing: (video, clipId, startTime, endTime, clickX, clickY) => {
    set({
      showModal: true,
      pendingProcess: { video, clipId, startTime, endTime, clickX, clickY },
      isActive: false,
      previewMask: null,
    });
  },
  cancelProcessing: () => {
    set({ showModal: false, pendingProcess: null });
  },
  confirmProcessing: async (fps: number) => {
    const { pendingProcess, isProcessing } = get();
    if (!pendingProcess || isProcessing) return;

    const { video, clipId, startTime, endTime, clickX, clickY } = pendingProcess;

    set({ showModal: false, pendingProcess: null });

    const regionId = generateId();
    const totalFrames = Math.ceil((endTime - startTime) * fps);

    // Create the region in processing state
    const region: ColorRegion = {
      id: regionId,
      clipId,
      frameMasks: [],
      isProcessing: true,
      totalFrames,
      processedFrames: 0,
    };

    const timelineStore = useTimelineStore.getState();
    timelineStore.addColorRegion(region);

    set({ isProcessing: true, processingRegionId: regionId });

    try {
      await processClip(video, startTime, endTime, clickX, clickY, fps, (progress) => {
        timelineStore.updateColorRegionProgress(regionId, progress.currentFrame, progress.frameMask);
      });

      timelineStore.setColorRegionComplete(regionId);
    } catch (error) {
      console.error('Error processing clip:', error);
      timelineStore.removeColorRegion(regionId);
    } finally {
      set({ isProcessing: false, processingRegionId: null });
    }
  },
}));
