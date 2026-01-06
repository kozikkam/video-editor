import { useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';

interface ProcessingModalProps {
  isOpen: boolean;
  clipDuration: number;
  onConfirm: (fps: number) => void;
  onCancel: () => void;
}

const MAX_FPS = 60;
const MIN_FPS = 1;

export function ProcessingModal({
  isOpen,
  clipDuration,
  onConfirm,
  onCancel,
}: ProcessingModalProps) {
  const [fps, setFps] = useState(10);

  const totalFrames = Math.ceil(clipDuration * fps);
  const estimatedTime = Math.ceil(totalFrames);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `~${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `~${mins}m ${secs}s`;
  };

  const handleFpsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseInt(e.target.value, 10);
    if (!Number.isNaN(value) && value >= MIN_FPS && value <= MAX_FPS) {
      setFps(value);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Color Isolation</DialogTitle>
          <DialogDescription>
            Track and isolate the selected object throughout the video.
          </DialogDescription>
        </DialogHeader>

        <div>
          <div className="grid grid-rows-2 items-center justify-between !mb-2">
            <span className="text-sm">Frame rate (FPS)</span>
            <Input
              type="number"
              min={1}
              max={60}
              value={fps}
              onChange={handleFpsChange}
              className="w-20 text-left [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Clip duration</span>
              <span>{clipDuration.toFixed(1)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frames to process</span>
              <span>{totalFrames}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estimated time</span>
              <span>{formatTime(estimatedTime)}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={() => onConfirm(fps)} className="flex-1">
            Process
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
