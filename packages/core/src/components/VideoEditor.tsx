import { AlertCircle, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useSources } from '../hooks/useSources';
import { cn } from '../lib/utils';
import { usePlaybackStore } from '../stores/playbackStore';
import { useTimelineStore } from '../stores/timelineStore';
import { Timeline } from './Timeline';
import { Toolbar } from './Toolbar';
import { VideoPreview } from './VideoPreview';

interface VideoEditorProps {
  className?: string;
}

export function VideoEditor({ className }: VideoEditorProps) {
  const { loadVideo, removeVideo } = useSources();
  const clips = useTimelineStore((state) => state.clips);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Global keyboard shortcuts
  useKeyboardShortcuts();

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      setError(null);
      try {
        for (const file of files) {
          await loadVideo(file);
        }
        usePlaybackStore.getState().seek(0);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load video. Please try a different file.';
        setError(message);
        console.error('Failed to load video:', err);
      }
    },
    [loadVideo],
  );

  const handleAddClipClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        handleFilesSelected(Array.from(files));
        event.target.value = '';
      }
    },
    [handleFilesSelected],
  );

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <div className={cn('h-full w-full flex flex-col bg-background text-foreground', className)}>
      {error && <ErrorBanner message={error} onDismiss={dismissError} />}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 min-h-0 lg:min-w-[300px] flex flex-col">
          <VideoPreview className="flex-1 min-h-0" onFilesSelected={handleFilesSelected} />
        </div>
      </div>

      <Toolbar
        onAddClip={handleAddClipClick}
        onRemoveAll={removeVideo}
        hasClips={clips.length > 0}
      />
      <Timeline className="flex-shrink-0" />
    </div>
  );
}

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-center gap-4 bg-red-950" style={{ padding: '12px 16px' }}>
      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-red-200">Upload Failed</p>
        <p className="text-sm text-red-400">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex-shrink-0 text-red-400 hover:text-red-200 transition-colors outline-none"
        style={{ padding: 8 }}
        aria-label="Dismiss error"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
