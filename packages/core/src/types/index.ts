export interface VideoSource {
  id: string;
  file: File;
  objectUrl: string;
  durationInSeconds: number;
  fileName: string;
  widthInPixels?: number;
  heightInPixels?: number;
  /** Detected frame rate (fps). Falls back to 30 if detection fails. */
  frameRate: number;
}

export interface TrimmedRegions {
  startSeconds: number;
  endSeconds: number;
}

export interface TimelineClip {
  id: string;
  sourceId: string;
  /** The start time within the source video (where playback begins in the original file) */
  sourceInPointSeconds: number;
  /** The end time within the source video (where playback ends in the original file) */
  sourceOutPointSeconds: number;
  /** The position on the timeline where this clip starts (independent of the source video's timing) */
  timelinePositionSeconds: number;
  trimmed: TrimmedRegions;
}

export interface ActiveClipPlaybackInfo {
  clip: TimelineClip;
  currentSourceTimeSeconds: number;
  source: VideoSource;
}

export interface MaskData {
  data: Uint8Array;
  width: number;
  height: number;
}

// A single frame's mask in the tracked sequence
export interface FrameMask {
  frameTimeSeconds: number;
  mask: MaskData;
}

// Color isolation region with frame-indexed masks for tracking
export interface ColorRegion {
  id: string;
  clipId: string;
  frameMasks: FrameMask[];
  isProcessing: boolean;
  totalFrames: number;
  processedFrames: number;
}
