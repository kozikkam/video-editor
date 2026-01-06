import { Crosshair, Download, Plus, Redo, Scissors, Trash2, Undo, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand';
import { cn } from '../lib/utils';
import { useExportStore } from '../stores/exportStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { useSegmentationStore } from '../stores/segmentationStore';
import { useTimelineStore } from '../stores/timelineStore';
import { ExportProgress } from './ExportProgress';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface ToolbarProps {
  className?: string;
  onAddClip?: () => void;
  onRemoveAll?: () => void;
  hasClips?: boolean;
}

export function Toolbar({ className, onAddClip, onRemoveAll, hasClips }: ToolbarProps) {
  const clips = useTimelineStore((state) => state.clips);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const splitClip = useTimelineStore((state) => state.splitClip);
  const removeClip = useTimelineStore((state) => state.removeClip);
  const currentTimeSeconds = usePlaybackStore((state) => state.currentTime);

  // Undo/Redo from temporal store
  const pastStates = useStore(useTimelineStore.temporal, (state) => state.pastStates);
  const futureStates = useStore(useTimelineStore.temporal, (state) => state.futureStates);

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  const handleUndo = useCallback(() => {
    useTimelineStore.temporal.getState().undo();
  }, []);

  const handleRedo = useCallback(() => {
    useTimelineStore.temporal.getState().redo();
  }, []);

  const canSplitSelectedClip = useMemo(() => {
    if (!selectedClipId) return false;

    const selectedClip = clips.find((c) => c.id === selectedClipId);
    if (!selectedClip) return false;

    const clipDurationSeconds =
      selectedClip.sourceOutPointSeconds - selectedClip.sourceInPointSeconds;
    const clipStartOnTimeline = selectedClip.timelinePositionSeconds;
    const clipEndOnTimeline = clipStartOnTimeline + clipDurationSeconds;

    const playheadIsAfterClipStart = currentTimeSeconds > clipStartOnTimeline;
    const playheadIsBeforeClipEnd = currentTimeSeconds < clipEndOnTimeline;
    const playheadIsInsideClip = playheadIsAfterClipStart && playheadIsBeforeClipEnd;

    return playheadIsInsideClip;
  }, [selectedClipId, clips, currentTimeSeconds]);

  const handleSplitClip = () => {
    if (selectedClipId) {
      splitClip(selectedClipId, currentTimeSeconds);
    }
  };

  const handleDeleteClip = () => {
    if (selectedClipId) {
      removeClip(selectedClipId);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'flex items-center gap-1 px-3 py-2 bg-card border-b border-border',
          className,
        )}
      >
        <div className="flex items-center gap-1">
          <ToolButton icon={Plus} label="Add clip" onClick={onAddClip ?? (() => {})} />
          <ToolButton
            icon={X}
            label="Remove all"
            onClick={onRemoveAll ?? (() => {})}
            disabled={!hasClips}
            destructive
          />
        </div>

        <Separator />

        <div className="flex items-center gap-1">
          <ToolButton
            icon={Scissors}
            label="Split clip"
            shortcut="S"
            onClick={handleSplitClip}
            disabled={!canSplitSelectedClip}
          />
          <ToolButton
            icon={Trash2}
            label="Delete clip"
            shortcut="Del"
            onClick={handleDeleteClip}
            disabled={!selectedClipId}
            destructive
          />
        </div>

        <Separator />

        <div className="flex items-center gap-1">
          <ToolButton
            icon={Undo}
            label="Undo"
            shortcut="⌘Z"
            onClick={handleUndo}
            disabled={!canUndo}
          />
          <ToolButton
            icon={Redo}
            label="Redo"
            shortcut="⌘⇧Z"
            onClick={handleRedo}
            disabled={!canRedo}
          />
        </div>

        <Separator />

        <div className="flex items-center gap-1">
          <ColorIsolationToolButton disabled={!hasClips} />
        </div>

        <Separator />

        <div className="flex items-center gap-1">
          <ExportToolButton disabled={!hasClips} />
        </div>

        <div className="flex-1" />

        <div className="text-xs text-muted-foreground">
          {selectedClipId ? (
            <span className="text-primary">1 clip selected</span>
          ) : (
            <span>{clips.length} clips</span>
          )}
        </div>

        <ExportProgress />
      </div>
    </TooltipProvider>
  );
}

interface ToolButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

function ToolButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled,
  destructive,
}: ToolButtonProps) {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick();
    event.currentTarget.blur();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClick}
          disabled={disabled}
          className={cn(destructive && 'hover:bg-destructive/20 hover:text-destructive')}
          aria-label={label}
        >
          <Icon className="w-4 h-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {label}
          {shortcut && <span className="ml-2 text-muted-foreground">({shortcut})</span>}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function Separator() {
  return <div className="w-px h-6 bg-border mx-1" />;
}

function ColorIsolationToolButton({ disabled }: { disabled?: boolean }) {
  const isActive = useSegmentationStore((s) => s.isActive);
  const isReady = useSegmentationStore((s) => s.isReady);
  const toggle = useSegmentationStore((s) => s.toggle);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    toggle();
    event.currentTarget.blur();
  };

  const isLoading = isActive && !isReady;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isActive ? 'default' : 'ghost'}
          size="icon-sm"
          onClick={handleClick}
          disabled={disabled}
          className={cn(isActive && 'bg-primary text-primary-foreground')}
          aria-label="Color isolation"
        >
          {isLoading ? <Spinner className="w-4 h-4" /> : <Crosshair className="w-4 h-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isActive ? 'Exit color isolation mode' : 'Color isolation (B&W background)'}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ExportToolButton({ disabled }: { disabled?: boolean }) {
  const state = useExportStore((s) => s.state);
  const startExport = useExportStore((s) => s.startExport);
  const isProcessing = useSegmentationStore((s) => s.isProcessing);

  const isExporting = state === 'exporting';
  const isDisabled = disabled || isExporting || isProcessing;

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    startExport();
    event.currentTarget.blur();
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClick}
          disabled={isDisabled}
          aria-label="Export video"
        >
          {isExporting ? <Spinner className="w-4 h-4" /> : <Download className="w-4 h-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isExporting ? 'Exporting...' : 'Export video (WebM)'}</p>
      </TooltipContent>
    </Tooltip>
  );
}

