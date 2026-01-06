import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { PointerEvent } from 'react';
import { useClipTrim } from '../hooks/useClipTrim';
import { cn, formatTime } from '../lib/utils';
import { useSourceStore } from '../stores/sourceStore';
import type { TimelineClip, VideoSource } from '../types';

interface ClipProps {
  clip: TimelineClip;
  pixelsPerSecond: number;
  isSelected: boolean;
  onSelect: () => void;
}

export function Clip({ clip, pixelsPerSecond, isSelected, onSelect }: ClipProps) {
  const source = useSourceStore((state) => state.sources.get(clip.sourceId));

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: clip.id,
  });

  const {
    trimMode,
    displayInPoint,
    displayOutPoint,
    displayTrimmedStart,
    displayTrimmedEnd,
    handleTrimPointerDown,
    handleTrimPointerMove,
    handleTrimPointerUp,
    finishTrim,
  } = useClipTrim({ clip, pixelsPerSecond, onSelect });

  if (!source) return null;

  const clipDurationSeconds = displayOutPoint - displayInPoint;
  const widthInPixels = clipDurationSeconds * pixelsPerSecond;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: Math.max(20, widthInPixels),
  };

  return (
    <div className="relative flex items-center" style={{ height: '100%' }}>
      <TrimmedRegion
        widthInPixels={displayTrimmedStart * pixelsPerSecond}
        visible={displayTrimmedStart > 0.01}
      />

      <ClipContainer
        ref={setNodeRef}
        style={style}
        isSelected={isSelected}
        isDragging={isDragging}
        attributes={attributes}
      >
        <ClipBackground isSelected={isSelected} />

        <TrimHandle
          position="start"
          isActive={trimMode === 'trim-start'}
          onPointerDown={(e) => handleTrimPointerDown(e, 'trim-start')}
          onPointerMove={(e) => handleTrimPointerMove(e, source.durationInSeconds)}
          onPointerUp={handleTrimPointerUp}
          onLostPointerCapture={finishTrim}
        />

        <ClipContent
          source={source}
          displayInPoint={displayInPoint}
          displayOutPoint={displayOutPoint}
          listeners={listeners}
          onSelect={onSelect}
        />

        <TrimHandle
          position="end"
          isActive={trimMode === 'trim-end'}
          onPointerDown={(e) => handleTrimPointerDown(e, 'trim-end')}
          onPointerMove={(e) => handleTrimPointerMove(e, source.durationInSeconds)}
          onPointerUp={handleTrimPointerUp}
          onLostPointerCapture={finishTrim}
        />
      </ClipContainer>

      <TrimmedRegion
        widthInPixels={displayTrimmedEnd * pixelsPerSecond}
        visible={displayTrimmedEnd > 0.01}
      />
    </div>
  );
}

interface ClipContainerProps {
  ref: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  isSelected: boolean;
  isDragging: boolean;
  attributes: DraggableAttributes;
  children: React.ReactNode;
}

function ClipContainer({
  ref,
  style,
  isSelected,
  isDragging,
  attributes,
  children,
}: ClipContainerProps) {
  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        'relative h-[calc(100%-8px)] rounded-md overflow-hidden flex-shrink-0',
        'transition-shadow duration-150',
        isSelected
          ? 'ring-2 ring-primary ring-offset-1 ring-offset-background shadow-lg'
          : 'hover:ring-1 hover:ring-primary/50',
        isDragging && 'opacity-50 z-50',
      )}
      {...attributes}
    >
      {children}
    </div>
  );
}

interface ClipBackgroundProps {
  isSelected: boolean;
}

function ClipBackground({ isSelected }: ClipBackgroundProps) {
  return (
    <div
      className="absolute inset-0"
      style={{ background: isSelected ? 'hsl(263 70% 55%)' : 'hsl(263 70% 45%)' }}
    />
  );
}

interface ClipContentProps {
  source: VideoSource;
  displayInPoint: number;
  displayOutPoint: number;
  listeners: DraggableSyntheticListeners;
  onSelect: () => void;
}

function ClipContent({
  source,
  displayInPoint,
  displayOutPoint,
  listeners,
  onSelect,
}: ClipContentProps) {
  return (
    <div
      className="absolute inset-x-3 inset-y-0 cursor-grab active:cursor-grabbing"
      {...listeners}
      onClick={onSelect}
    >
      <div className="h-full flex flex-col justify-center px-2 overflow-hidden">
        <p className="text-xs font-medium text-white truncate">{source.fileName}</p>
        <p className="text-[10px] text-white/70 tabular-nums">
          {formatTime(displayInPoint)} - {formatTime(displayOutPoint)}
        </p>
      </div>
    </div>
  );
}

interface TrimmedRegionProps {
  widthInPixels: number;
  visible: boolean;
}

function TrimmedRegion({ widthInPixels, visible }: TrimmedRegionProps) {
  if (!visible) return null;

  return (
    <div
      className="h-[calc(100%-8px)] flex-shrink-0 pointer-events-none border-2 border-dashed border-muted-foreground/30 bg-muted/10 rounded-md"
      style={{ width: widthInPixels }}
    >
      <div
        className="w-full h-full opacity-20"
        style={{
          background:
            'repeating-linear-gradient(45deg, transparent, transparent 4px, hsl(263 70% 45% / 0.3) 4px, hsl(263 70% 45% / 0.3) 8px)',
        }}
      />
    </div>
  );
}

interface TrimHandleProps {
  position: 'start' | 'end';
  isActive: boolean;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: () => void;
}

function TrimHandle({
  position,
  isActive,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onLostPointerCapture,
}: TrimHandleProps) {
  return (
    <div
      className={cn(
        'absolute top-0 w-3 h-full cursor-ew-resize z-10',
        'flex items-center justify-center',
        'hover:bg-white/20 transition-colors',
        position === 'start' ? 'left-0' : 'right-0',
        isActive && 'bg-white/30',
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onLostPointerCapture={onLostPointerCapture}
    >
      <GripVertical className="w-3 h-4 text-white/60" />
    </div>
  );
}
