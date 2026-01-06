import { create } from 'zustand';
import {
  exportVideo,
  downloadBlob,
  type ExportProgress,
} from '../lib/export/videoExporter';
import { useSourceStore } from './sourceStore';
import { useTimelineStore } from './timelineStore';

export type ExportState = 'idle' | 'exporting' | 'complete' | 'error';

interface ExportStore {
  state: ExportState;
  progress: ExportProgress | null;
  error: string | null;
  abortController: AbortController | null;

  startExport: () => Promise<void>;
  cancelExport: () => void;
  reset: () => void;
}

export const useExportStore = create<ExportStore>((set, get) => ({
  state: 'idle',
  progress: null,
  error: null,
  abortController: null,

  startExport: async () => {
    const { state } = get();
    if (state === 'exporting') return;

    const abortController = new AbortController();

    set({
      state: 'exporting',
      progress: null,
      error: null,
      abortController,
    });

    try {
      const clips = useTimelineStore.getState().clips;
      const colorRegions = useTimelineStore.getState().colorRegions;
      const getSource = useSourceStore.getState().getSource;

      if (clips.length === 0) {
        throw new Error('No clips to export');
      }

      const blob = await exportVideo(
        clips,
        colorRegions,
        getSource,
        (progress) => {
          set({ progress });
        },
        abortController.signal,
      );

      const timestamp = Date.now();
      const filename = `export-${timestamp}.webm`;

      downloadBlob(blob, filename);

      set({ state: 'complete', abortController: null });
    } catch (error) {
      if (abortController.signal.aborted) {
        set({ state: 'idle', error: null, abortController: null });
      } else {
        const message = error instanceof Error ? error.message : 'Export failed';
        console.error('Export error:', error);
        set({ state: 'error', error: message, abortController: null });
      }
    }
  },

  cancelExport: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    set({ state: 'idle', progress: null, abortController: null });
  },

  reset: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    set({
      state: 'idle',
      progress: null,
      error: null,
      abortController: null,
    });
  },
}));

