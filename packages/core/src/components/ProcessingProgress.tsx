import { useSegmentationStore } from '../stores/segmentationStore';
import { useTimelineStore } from '../stores/timelineStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Progress } from './ui/progress';

export function ProcessingProgress() {
  const isProcessing = useSegmentationStore((s) => s.isProcessing);
  const processingRegionId = useSegmentationStore((s) => s.processingRegionId);
  const colorRegions = useTimelineStore((s) => s.colorRegions);

  const processingRegion = processingRegionId
    ? colorRegions.find((r) => r.id === processingRegionId)
    : null;

  if (!processingRegion) return null;

  const { processedFrames, totalFrames } = processingRegion;
  const progressPercent = totalFrames > 0 ? Math.round((processedFrames / totalFrames) * 100) : 0;

  return (
    <Dialog open={isProcessing}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Processing Video</DialogTitle>
          <DialogDescription>
            Tracking and segmenting object through frames...
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Progress value={progressPercent} />

          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              Frame {processedFrames} / {totalFrames}
            </span>
            <span className="font-medium text-foreground">{progressPercent}%</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
