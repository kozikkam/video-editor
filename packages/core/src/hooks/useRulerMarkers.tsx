import { useMemo } from 'react';
import { formatTime } from '../lib/utils';

/** Minimum interval that should show sub-markers between main markers */
const MIN_INTERVAL_FOR_SUB_MARKERS_SECONDS = 2;

/** Pixels per second thresholds for different marker intervals */
const MARKER_INTERVAL_THRESHOLDS = {
  FINE: { minPixelsPerSecond: 100, intervalSeconds: 1 },
  MEDIUM: { minPixelsPerSecond: 50, intervalSeconds: 2 },
  COARSE: { minPixelsPerSecond: 25, intervalSeconds: 5 },
  VERY_COARSE: { minPixelsPerSecond: 0, intervalSeconds: 10 },
} as const;

interface UseRulerMarkersOptions {
  pixelsPerSecond: number;
  containerWidthPixels: number;
  totalDurationSeconds: number;
  hasContent: boolean;
}

interface RulerMarker {
  key: string;
  type: 'main' | 'sub';
  leftPixels: number;
  timeSeconds: number;
}

function calculateMarkerIntervalSeconds(pixelsPerSecond: number): number {
  if (pixelsPerSecond > MARKER_INTERVAL_THRESHOLDS.FINE.minPixelsPerSecond) {
    return MARKER_INTERVAL_THRESHOLDS.FINE.intervalSeconds;
  }
  if (pixelsPerSecond > MARKER_INTERVAL_THRESHOLDS.MEDIUM.minPixelsPerSecond) {
    return MARKER_INTERVAL_THRESHOLDS.MEDIUM.intervalSeconds;
  }
  if (pixelsPerSecond > MARKER_INTERVAL_THRESHOLDS.COARSE.minPixelsPerSecond) {
    return MARKER_INTERVAL_THRESHOLDS.COARSE.intervalSeconds;
  }
  return MARKER_INTERVAL_THRESHOLDS.VERY_COARSE.intervalSeconds;
}

function generateMarkers(
  maxTimeSeconds: number,
  markerIntervalSeconds: number,
  pixelsPerSecond: number,
): RulerMarker[] {
  const markers: RulerMarker[] = [];
  const shouldShowSubMarkers = markerIntervalSeconds >= MIN_INTERVAL_FOR_SUB_MARKERS_SECONDS;

  for (let t = 0; t <= maxTimeSeconds; t += markerIntervalSeconds) {
    const leftPixels = t * pixelsPerSecond;

    // Add main marker
    markers.push({
      key: `main-${t}`,
      type: 'main',
      leftPixels,
      timeSeconds: t,
    });

    // Add sub-markers between main markers
    if (shouldShowSubMarkers) {
      for (let sub = 1; sub < markerIntervalSeconds; sub++) {
        const subTime = t + sub;
        if (subTime <= maxTimeSeconds) {
          markers.push({
            key: `sub-${t}-${sub}`,
            type: 'sub',
            leftPixels: subTime * pixelsPerSecond,
            timeSeconds: subTime,
          });
        }
      }
    }
  }

  return markers;
}

export function useRulerMarkers({
  pixelsPerSecond,
  containerWidthPixels,
  totalDurationSeconds,
  hasContent,
}: UseRulerMarkersOptions) {
  return useMemo(() => {
    const markerIntervalSeconds = calculateMarkerIntervalSeconds(pixelsPerSecond);
    const visibleSeconds = Math.ceil(containerWidthPixels / pixelsPerSecond);
    const maxTimeSeconds = hasContent
      ? Math.max(Math.ceil(totalDurationSeconds), visibleSeconds)
      : visibleSeconds;

    const markers = generateMarkers(maxTimeSeconds, markerIntervalSeconds, pixelsPerSecond);

    return markers;
  }, [pixelsPerSecond, containerWidthPixels, totalDurationSeconds, hasContent]);
}

interface RulerMarkerElementProps {
  marker: RulerMarker;
}

export function RulerMarkerElement({ marker }: RulerMarkerElementProps) {
  if (marker.type === 'main') {
    return (
      <div
        className="absolute top-0 flex flex-col items-center -translate-x-1/2"
        style={{ left: marker.leftPixels }}
      >
        <div className="w-px h-3 bg-border" />
        <span className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
          {formatTime(marker.timeSeconds)}
        </span>
      </div>
    );
  }

  return (
    <div
      className="absolute top-0 w-px h-1.5 bg-border/50 -translate-x-1/2"
      style={{ left: marker.leftPixels }}
    />
  );
}
