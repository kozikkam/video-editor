import { CheckCircle, XCircle } from 'lucide-react';
import { formatTime } from '../lib/utils';
import { useExportStore } from '../stores/exportStore';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Progress } from './ui/progress';

export function ExportProgress() {
  const state = useExportStore((s) => s.state);
  const progress = useExportStore((s) => s.progress);
  const error = useExportStore((s) => s.error);
  const cancelExport = useExportStore((s) => s.cancelExport);
  const reset = useExportStore((s) => s.reset);

  const isOpen = state === 'exporting' || state === 'complete' || state === 'error';

  const handleClose = () => {
    if (state === 'exporting') {
      cancelExport();
    } else {
      reset();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        {state === 'exporting' && (
          <>
            <DialogHeader>
              <DialogTitle>Exporting Video</DialogTitle>
              <DialogDescription>
                Recording video with effects... This takes as long as the video duration.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Progress value={progress?.percentage ?? 0} />

              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  {formatTime(progress?.currentTime ?? 0)} / {formatTime(progress?.totalDuration ?? 0)}
                </span>
                <span className="font-medium text-foreground">{progress?.percentage ?? 0}%</span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={cancelExport} className="w-full">
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}

        {state === 'complete' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <DialogTitle>Export Complete</DialogTitle>
              </div>
              <DialogDescription>
                Your video has been exported and downloaded successfully.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button onClick={reset} className="w-full">
                Done
              </Button>
            </DialogFooter>
          </>
        )}

        {state === 'error' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-destructive" />
                <DialogTitle>Export Failed</DialogTitle>
              </div>
              <DialogDescription>{error || 'An unknown error occurred'}</DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button variant="outline" onClick={reset} className="w-full">
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
