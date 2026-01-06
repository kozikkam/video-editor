import { cn } from '../lib/utils';

const PLAYHEAD_COLOR = 'hsl(38 92% 50%)';

interface PlayheadProps {
  positionInPixels: number;
  className?: string;
}

function PlayheadTriangle() {
  return (
    <div
      className="absolute -top-1 -translate-x-1/2 w-0 h-0"
      style={{
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: `8px solid ${PLAYHEAD_COLOR}`,
      }}
    />
  );
}

export function Playhead({ positionInPixels, className }: PlayheadProps) {
  return (
    <div
      className={cn('absolute top-0 z-20 pointer-events-none', className)}
      style={{
        left: positionInPixels,
        height: '100%',
      }}
    >
      <PlayheadTriangle />
      <div
        className="absolute top-1 left-0 w-0.5 -translate-x-1/2"
        style={{
          height: 'calc(100% - 4px)',
          background: PLAYHEAD_COLOR,
        }}
      />
    </div>
  );
}
