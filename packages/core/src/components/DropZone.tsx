import { Film } from 'lucide-react';
import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { cn } from '../lib/utils';

// Supported video MIME types and extensions
const VIDEO_MIME_TYPES = {
  'video/mp4': ['.mp4', '.m4v'],
  'video/webm': ['.webm'],
  'video/ogg': ['.ogv', '.ogg'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
  'video/mpeg': ['.mpeg', '.mpg'],
};

function isVideoFile(file: File): boolean {
  // Check MIME type
  if (file.type.startsWith('video/')) {
    return true;
  }
  // Fallback: check extension for files with missing/incorrect MIME type
  const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
  const allExtensions = Object.values(VIDEO_MIME_TYPES).flat();
  return allExtensions.includes(extension);
}

interface DropZoneProps {
  className?: string;
  children?: React.ReactNode;
  onFilesSelected?: (files: File[]) => void;
}

export function DropZone({ className, children, onFilesSelected }: DropZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const videoFiles = acceptedFiles.filter(isVideoFile);
      if (videoFiles.length > 0) {
        onFilesSelected?.(videoFiles);
      }
    },
    [onFilesSelected],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: VIDEO_MIME_TYPES,
    multiple: true,
    noClick: !!children,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'relative flex flex-col items-center justify-center',
        'border-2 border-dashed rounded-lg transition-all duration-200',
        isDragActive
          ? 'border-primary bg-primary/10 scale-[1.02]'
          : 'border-border hover:border-primary/50',
        className,
      )}
    >
      <input {...getInputProps()} />

      {children ? (
        children
      ) : (
        <div
          className={cn(
            'flex flex-col items-center gap-3 text-muted-foreground transition-colors p-8',
            isDragActive && 'text-primary',
          )}
        >
          <Film className="w-10 h-10" />
          <div className="text-center">
            <p className="text-sm font-medium">
              {isDragActive ? 'Drop videos here' : 'Drag & drop videos'}
            </p>
            <p className="text-xs mt-1">or click to browse</p>
          </div>
        </div>
      )}
    </div>
  );
}
