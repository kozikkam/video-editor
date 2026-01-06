import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { ZoomIn, ZoomOut } from 'lucide-react';
import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from 'react';
import { RulerMarkerElement, useRulerMarkers } from '../hooks/useRulerMarkers';
import {
  calculatePlayheadVisualPosition,
  calculateTimelineTimeFromVisualPosition,
  cn,
  formatTime,
} from '../lib/utils';
import { usePlaybackStore } from '../stores/playbackStore';
import { useTimelineStore } from '../stores/timelineStore';
import { Clip } from './Clip';
import { Playhead } from './Playhead';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface TimelineProps {
  className?: string;
}

export function Timeline({ className }: TimelineProps) {
  const clips = useTimelineStore((state) => state.clips);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const pixelsPerSecond = useTimelineStore((state) => state.pixelsPerSecond);
  const getDuration = useTimelineStore((state) => state.getDuration);
  const selectClip = useTimelineStore((state) => state.selectClip);
  const setPixelsPerSecond = useTimelineStore((state) => state.setPixelsPerSecond);
  const reorderClips = useTimelineStore((state) => state.reorderClips);

  const currentTimeSeconds = usePlaybackStore((state) => state.currentTime);
  const seek = usePlaybackStore((state) => state.seek);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    const updateWidth = () => {
      if (scrollRef.current) {
        setContainerWidth(scrollRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const totalDurationSeconds = getDuration();
  const hasContent = clips.length > 0;

  const convertSecondsToPixels = useCallback(
    (seconds: number) => seconds * pixelsPerSecond,
    [pixelsPerSecond],
  );

  const timelineWidthInPixels = hasContent
    ? convertSecondsToPixels(totalDurationSeconds)
    : containerWidth;

  const rulerHeightInPixels = 32;
  const trackHeightInPixels = 80;

  const seekToPointerPosition = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const x = Math.max(0, event.clientX - rect.left);
      const timeSeconds = calculateTimelineTimeFromVisualPosition(x, clips, pixelsPerSecond);
      seek(Math.max(0, Math.min(timeSeconds, totalDurationSeconds)));
    },
    [clips, pixelsPerSecond, seek, totalDurationSeconds],
  );

  const handleRulerPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!hasContent) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsScrubbing(true);
      seekToPointerPosition(event);
    },
    [seekToPointerPosition, hasContent],
  );

  const handleRulerPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isScrubbing) return;
      seekToPointerPosition(event);
    },
    [isScrubbing, seekToPointerPosition],
  );

  const handleRulerPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsScrubbing(false);
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -5 : 5;
        setPixelsPerSecond(pixelsPerSecond + delta);
      }
    },
    [pixelsPerSecond, setPixelsPerSecond],
  );

  const handleTrackAreaClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        selectClip(null);
      }
    },
    [selectClip],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        reorderClips(active.id as string, over.id as string);
      }
    },
    [reorderClips],
  );

  const rulerMarkers = useRulerMarkers({
    pixelsPerSecond,
    containerWidthPixels: containerWidth,
    totalDurationSeconds,
    hasContent,
  });

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-col bg-card border-t border-border', className)}
      onWheel={handleWheel}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Timeline</span>
          <span className="text-xs text-primary font-mono tabular-nums">
            {formatTime(currentTimeSeconds)}
          </span>
        </div>
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    setPixelsPerSecond(pixelsPerSecond - 10);
                    e.currentTarget.blur();
                  }}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom out</TooltipContent>
            </Tooltip>
            <span className="text-xs text-muted-foreground w-12 text-center tabular-nums">
              {pixelsPerSecond}px/s
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    setPixelsPerSecond(pixelsPerSecond + 10);
                    e.currentTarget.blur();
                  }}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom in</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div
          ref={rulerRef}
          className={cn(
            'flex-shrink-0 relative bg-background border-b border-border',
            hasContent && 'cursor-pointer',
            isScrubbing && 'cursor-grabbing',
          )}
          style={{ height: rulerHeightInPixels }}
          onPointerDown={handleRulerPointerDown}
          onPointerMove={handleRulerPointerMove}
          onPointerUp={handleRulerPointerUp}
          onPointerCancel={handleRulerPointerUp}
        >
          <div
            className="relative h-full"
            style={{ width: hasContent ? timelineWidthInPixels : '100%' }}
          >
            {rulerMarkers.map((marker) => (
              <RulerMarkerElement key={marker.key} marker={marker} />
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          className={cn(
            'relative bg-secondary/30',
            hasContent ? 'overflow-x-auto overflow-y-hidden' : 'overflow-hidden',
          )}
          onClick={handleTrackAreaClick}
          style={{ height: trackHeightInPixels }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={clips.map((c) => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div
                className="relative h-full flex items-center"
                style={{ width: hasContent ? timelineWidthInPixels : '100%' }}
              >
                {clips.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">Add clips to the timeline</span>
                  </div>
                ) : (
                  clips.map((clip) => (
                    <Clip
                      key={clip.id}
                      clip={clip}
                      pixelsPerSecond={pixelsPerSecond}
                      isSelected={clip.id === selectedClipId}
                      onSelect={() => selectClip(clip.id)}
                    />
                  ))
                )}

                {hasContent && (
                  <Playhead
                    positionInPixels={calculatePlayheadVisualPosition(
                      Math.min(currentTimeSeconds, totalDurationSeconds),
                      clips,
                      pixelsPerSecond,
                    )}
                  />
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
