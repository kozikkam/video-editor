import { Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSegmentationInteraction } from '../hooks/useSegmentationInteraction';
import { useVideoPlayback } from '../hooks/useVideoPlayback';
import { cn, formatTime, getActiveClipAtTime } from '../lib/utils';
import { usePlaybackStore } from '../stores/playbackStore';
import { useSegmentationStore } from '../stores/segmentationStore';
import { useSourceStore } from '../stores/sourceStore';
import { useTimelineStore } from '../stores/timelineStore';
import type { VideoSource } from '../types';
import { DropZone } from './DropZone';
import { ProcessingModal } from './ProcessingModal';
import { ProcessingProgress } from './ProcessingProgress';
import { SegmentOverlay } from './SegmentOverlay';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface VideoPreviewProps {
  className?: string;
  onFilesSelected?: (files: File[]) => void;
}

export function VideoPreview({ className, onFilesSelected }: VideoPreviewProps) {
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [isMuted, setIsMuted] = useState(false);

  const getVideoRef = useCallback((sourceId: string) => {
    return videoRefs.current.get(sourceId) ?? null;
  }, []);

  const {
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
  } = useVideoPlayback({ getVideoRef });

  return (
    <div className={cn('flex flex-col bg-black', className)}>
      <VideoDisplay
        videoRefs={videoRefs}
        activeSourceId={activeSourceId}
        hasContent={hasContent}
        isMuted={isMuted}
        onFilesSelected={onFilesSelected}
      />

      {hasContent && (
        <PlaybackControls
          currentTimeSeconds={currentTimeSeconds}
          totalDurationSeconds={totalDurationSeconds}
          isPlaying={isPlaying}
          isEnded={isEnded}
          isMuted={isMuted}
          onTogglePlay={handleTogglePlay}
          onRestart={handleRestart}
          onSeek={seek}
          onSeekRelative={seekRelative}
          onToggleMute={() => setIsMuted(!isMuted)}
        />
      )}
    </div>
  );
}

interface VideoDisplayProps {
  videoRefs: React.RefObject<Map<string, HTMLVideoElement>>;
  activeSourceId: string | null;
  hasContent: boolean;
  isMuted: boolean;
  onFilesSelected?: (files: File[]) => void;
}

function VideoDisplay({
  videoRefs,
  activeSourceId,
  hasContent,
  isMuted,
  onFilesSelected,
}: VideoDisplayProps) {
  const sources = useSourceStore((state) => state.sources);
  const getSource = useSourceStore((state) => state.getSource);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

  const showModal = useSegmentationStore((s) => s.showModal);
  const pendingProcess = useSegmentationStore((s) => s.pendingProcess);
  const cancelProcessing = useSegmentationStore((s) => s.cancelProcessing);
  const confirmProcessing = useSegmentationStore((s) => s.confirmProcessing);

  const clips = useTimelineStore((state) => state.clips);
  const currentTimeSeconds = usePlaybackStore((state) => state.currentTime);

  // Get active clip and source time
  const activeClipInfo = useMemo(() => {
    return getActiveClipAtTime(currentTimeSeconds, clips, getSource);
  }, [clips, currentTimeSeconds, getSource]);

  const activeClipId = activeClipInfo?.clip.id ?? null;
  const currentSourceTime = activeClipInfo?.currentSourceTimeSeconds ?? 0;

  useEffect(() => {
    for (const video of videoRefs.current.values()) {
      video.muted = isMuted;
    }
  }, [isMuted, videoRefs]);

  const setVideoRef = useCallback(
    (sourceId: string, element: HTMLVideoElement | null) => {
      if (element) {
        videoRefs.current.set(sourceId, element);
        element.preload = 'auto';
        element.muted = isMuted;
      } else {
        videoRefs.current.delete(sourceId);
      }
    },
    [videoRefs, isMuted],
  );

  // Update video dimensions on resize/load
  useEffect(() => {
    if (!activeSourceId) return;
    const video = videoRefs.current.get(activeSourceId);
    if (!video) return;

    const updateDimensions = () => {
      const container = containerRef.current;
      if (!container || !video.videoWidth || !video.videoHeight) return;

      const containerAspect = container.clientWidth / container.clientHeight;
      const videoAspect = video.videoWidth / video.videoHeight;

      let displayWidth: number;
      let displayHeight: number;

      if (videoAspect > containerAspect) {
        displayWidth = Math.min(container.clientWidth, video.videoWidth);
        displayHeight = displayWidth / videoAspect;
      } else {
        displayHeight = Math.min(container.clientHeight, video.videoHeight);
        displayWidth = displayHeight * videoAspect;
      }

      setVideoDimensions({ width: displayWidth, height: displayHeight });
      setImageDimensions({ width: video.videoWidth, height: video.videoHeight });
    };

    video.addEventListener('loadedmetadata', updateDimensions);
    updateDimensions();

    return () => video.removeEventListener('loadedmetadata', updateDimensions);
  }, [activeSourceId, videoRefs]);

  const { isInteractive, handleClick, handleMouseMove, handleMouseLeave } = useSegmentationInteraction({
    containerRef,
    videoRefs,
    activeSourceId,
    activeClipInfo,
    videoDimensions,
    imageDimensions,
    currentTimeSeconds,
  });

  const clipDuration = pendingProcess ? pendingProcess.endTime - pendingProcess.startTime : 0;
  const sourceArray = Array.from(sources.values());

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex-1 min-h-0 flex items-center justify-center overflow-hidden',
        isInteractive && 'cursor-crosshair',
      )}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {hasContent ? (
        <>
          {sourceArray.map((source: VideoSource) => (
            // biome-ignore lint/a11y/useMediaCaption: Video editor preview doesn't need captions
            <video
              key={source.id}
              ref={(el) => setVideoRef(source.id, el)}
              src={source.objectUrl}
              className={cn(
                'max-w-full max-h-full object-contain absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
                source.id === activeSourceId ? 'visible' : 'invisible',
              )}
              playsInline
            />
          ))}
          {videoDimensions.width > 0 && videoDimensions.height > 0 && activeSourceId && (
            <SegmentOverlay
              width={videoDimensions.width}
              height={videoDimensions.height}
              clipId={activeClipId}
              video={videoRefs.current.get(activeSourceId) ?? null}
              currentSourceTime={currentSourceTime}
              className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            />
          )}
          <ProcessingProgress />
          <ProcessingModal
            isOpen={showModal}
            clipDuration={clipDuration}
            onConfirm={confirmProcessing}
            onCancel={cancelProcessing}
          />
        </>
      ) : (
        <DropZone
          className="w-full h-full border-0 rounded-none bg-transparent hover:bg-muted/5"
          onFilesSelected={onFilesSelected}
        />
      )}
    </div>
  );
}

interface PlaybackControlsProps {
  currentTimeSeconds: number;
  totalDurationSeconds: number;
  isPlaying: boolean;
  isEnded: boolean;
  isMuted: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSeek: (time: number) => void;
  onSeekRelative: (delta: number) => void;
  onToggleMute: () => void;
}

function PlaybackControls({
  currentTimeSeconds,
  totalDurationSeconds,
  isPlaying,
  isEnded,
  isMuted,
  onTogglePlay,
  onRestart,
  onSeek,
  onSeekRelative,
  onToggleMute,
}: PlaybackControlsProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex-shrink-0 p-3 bg-card border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <PlaybackButton icon={SkipBack} label="Go to start" onClick={() => onSeek(0)} />
            <PlaybackButton icon={SkipBack} label="Back 5s" onClick={() => onSeekRelative(-5)} />

            {isEnded ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={(e) => {
                      onRestart();
                      e.currentTarget.blur();
                    }}
                    size="icon"
                    className="rounded-full"
                    aria-label="Restart"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Restart</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={(e) => {
                      onTogglePlay();
                      e.currentTarget.blur();
                    }}
                    size="icon"
                    className="rounded-full"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 ml-0.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isPlaying ? 'Pause' : 'Play'}</TooltipContent>
              </Tooltip>
            )}

            <PlaybackButton
              icon={SkipForward}
              label="Forward 5s"
              onClick={() => onSeekRelative(5)}
            />
            <PlaybackButton
              icon={SkipForward}
              label="Go to end"
              onClick={() => onSeek(totalDurationSeconds)}
            />
          </div>

          <div className="flex items-center gap-2">
            <PlaybackButton
              icon={isMuted ? VolumeX : Volume2}
              label={isMuted ? 'Unmute' : 'Mute'}
              onClick={onToggleMute}
            />
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              {formatTime(currentTimeSeconds)} / {formatTime(totalDurationSeconds)}
            </span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

interface PlaybackButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}

function PlaybackButton({ icon: Icon, label, onClick }: PlaybackButtonProps) {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick();
    event.currentTarget.blur();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={handleClick} aria-label={label}>
          <Icon className="w-4 h-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
