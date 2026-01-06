import fixWebmDuration from 'fix-webm-duration';
import type { ColorRegion, MaskData, TimelineClip, VideoSource } from '../../types';
import { ColorIsolationRenderer } from '../colorIsolation/colorIsolationRenderer';
import { getMaskForTime } from '../tracking/clipProcessor';

const DEFAULT_FRAME_RATE = 30;
const RECORDER_TIMESLICE_MS = 1000;
const STOP_DELAY_MS = 200;
const SEEK_THRESHOLD_SECONDS = 0.1;

export interface ExportProgress {
  currentTime: number;
  totalDuration: number;
  percentage: number;
}

export type ExportProgressCallback = (progress: ExportProgress) => void;

interface ClipBoundary {
  clip: TimelineClip;
  start: number;
  end: number;
  regions: ColorRegion[];
}

interface ExportResources {
  canvas: HTMLCanvasElement;
  renderer: ColorIsolationRenderer;
  videoElements: Map<string, HTMLVideoElement>;
  canvasStream: MediaStream;
  audioContext: AudioContext;
  recorder: MediaRecorder;
  mimeType: string;
}

/**
 * Exports the timeline to a WebM video file using MediaRecorder.
 *
 * The export process plays through the timeline in real-time, rendering each frame
 * to a canvas with WebGL (including color isolation effects), while MediaRecorder
 * captures the canvas stream and audio from all source videos.
 *
 * @param clips - Timeline clips to export, in sequential order
 * @param colorRegions - Color isolation regions with frame masks for effects
 * @param getSource - Function to retrieve VideoSource by ID
 * @param onProgress - Optional callback for progress updates (called each frame)
 * @param abortSignal - Optional signal to cancel the export
 * @returns Promise resolving to the exported WebM blob with fixed duration metadata
 * @throws Error if no clips provided or no valid video sources found
 */
export async function exportVideo(
  clips: TimelineClip[],
  colorRegions: ColorRegion[],
  getSource: (sourceId: string) => VideoSource | undefined,
  onProgress?: ExportProgressCallback,
  abortSignal?: AbortSignal,
): Promise<Blob> {
  validateClips(clips);

  const totalDuration = calculateTotalDuration(clips);
  const { width, height } = getOutputResolution(clips, getSource);
  const frameRate = getMaxFrameRate(clips, getSource);

  validateResolution(width, height);

  const resources = await setupExportResources(clips, getSource, width, height, frameRate);
  const clipBoundaries = precomputeClipBoundaries(clips, colorRegions);

  return recordTimeline(resources, clipBoundaries, totalDuration, onProgress, abortSignal);
}

function validateClips(clips: TimelineClip[]): void {
  if (clips.length === 0) {
    throw new Error('No clips to export');
  }
}

function validateResolution(width: number, height: number): void {
  if (width === 0 || height === 0) {
    throw new Error('No valid video sources found');
  }
}

/**
 * Creates and initializes all resources needed for export.
 *
 * Sets up: canvas for rendering, WebGL renderer, video elements for each source,
 * canvas capture stream, audio routing (mixing all video audio tracks), and MediaRecorder.
 */
async function setupExportResources(
  clips: TimelineClip[],
  getSource: (sourceId: string) => VideoSource | undefined,
  width: number,
  height: number,
  frameRate: number,
): Promise<ExportResources> {
  const canvas = createCanvas(width, height);
  const renderer = new ColorIsolationRenderer(canvas);
  const videoElements = await prepareVideoElements(clips, getSource);
  const canvasStream = canvas.captureStream(frameRate);
  const audioContext = setupAudioRouting(videoElements, canvasStream);
  const mimeType = getSupportedMimeType();
  const recorder = createRecorder(canvasStream, mimeType);

  return { canvas, renderer, videoElements, canvasStream, audioContext, recorder, mimeType };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Routes audio from all video elements to the canvas stream.
 *
 * Creates a Web Audio graph that connects each video element's audio output
 * to a single destination, then adds that audio track to the canvas stream
 * for synchronized recording.
 */
function setupAudioRouting(
  videoElements: Map<string, HTMLVideoElement>,
  canvasStream: MediaStream,
): AudioContext {
  const audioContext = new AudioContext();
  const audioDestination = audioContext.createMediaStreamDestination();

  for (const video of videoElements.values()) {
    const source = audioContext.createMediaElementSource(video);
    source.connect(audioDestination);
  }

  const audioTrack = audioDestination.stream.getAudioTracks()[0];
  if (audioTrack) {
    canvasStream.addTrack(audioTrack);
  }

  return audioContext;
}

function createRecorder(stream: MediaStream, mimeType: string): MediaRecorder {
  return new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 128_000,
  });
}

/**
 * Creates video elements for each unique source in the timeline.
 *
 * Deduplicates sources (same source may be used in multiple clips) and
 * preloads each video to ensure smooth playback during export.
 */
async function prepareVideoElements(
  clips: TimelineClip[],
  getSource: (sourceId: string) => VideoSource | undefined,
): Promise<Map<string, HTMLVideoElement>> {
  const elements = new Map<string, HTMLVideoElement>();
  const uniqueSourceIds = new Set(clips.map((c) => c.sourceId));

  for (const sourceId of uniqueSourceIds) {
    const source = getSource(sourceId);
    if (!source) continue;

    const video = await loadVideoElement(source);
    elements.set(sourceId, video);
  }

  return elements;
}

async function loadVideoElement(source: VideoSource): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.src = source.objectUrl;
  video.muted = false;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error(`Failed to load video: ${source.fileName}`));
    video.load();
  });

  return video;
}

/**
 * Precomputes clip boundaries and associated color regions for O(1) lookup during render.
 *
 * Instead of searching all clips each frame, we create a lookup structure with
 * precomputed start/end times and pre-filtered color regions per clip.
 * The render loop can then advance through clips sequentially.
 */
function precomputeClipBoundaries(
  clips: TimelineClip[],
  colorRegions: ColorRegion[],
): ClipBoundary[] {
  return clips.map((clip) => {
    const duration = clip.sourceOutPointSeconds - clip.sourceInPointSeconds;
    return {
      clip,
      start: clip.timelinePositionSeconds,
      end: clip.timelinePositionSeconds + duration,
      regions: colorRegions.filter((r) => r.clipId === clip.id),
    };
  });
}

/**
 * Main recording loop that plays through the timeline in real-time.
 *
 * Uses requestAnimationFrame to render each frame, syncing video playback
 * with the elapsed time. Handles abort signals, cleanup, and fixes WebM
 * duration metadata on completion (MediaRecorder doesn't include it).
 */
function recordTimeline(
  resources: ExportResources,
  clipBoundaries: ClipBoundary[],
  totalDuration: number,
  onProgress?: ExportProgressCallback,
  abortSignal?: AbortSignal,
): Promise<Blob> {
  const { renderer, videoElements, audioContext, recorder, mimeType } = resources;
  const chunks: Blob[] = [];

  return new Promise((resolve, reject) => {
    let animationFrameId: number;
    let isAborted = false;
    let currentClipIndex = 0;
    const startTime = performance.now();

    const cleanup = () => {
      cancelAnimationFrame(animationFrameId);
      for (const video of videoElements.values()) {
        video.pause();
        video.src = '';
      }
      audioContext.close();
      renderer.dispose();
    };

    const handleAbort = () => {
      isAborted = true;
      recorder.stop();
      cleanup();
      reject(new Error('Export cancelled'));
    };

    abortSignal?.addEventListener('abort', handleAbort);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      if (isAborted) return;
      cleanup();
      const rawBlob = new Blob(chunks, { type: mimeType });
      const fixedBlob = await fixWebmDuration(rawBlob, totalDuration * 1000);
      resolve(fixedBlob);
    };

    recorder.onerror = (e) => {
      cleanup();
      reject(e);
    };

    const renderFrame = () => {
      if (isAborted) return;

      const elapsed = (performance.now() - startTime) / 1000;

      reportProgress(onProgress, elapsed, totalDuration);

      currentClipIndex = advanceClipIndex(currentClipIndex, clipBoundaries, elapsed);

      renderCurrentFrame(
        clipBoundaries[currentClipIndex],
        elapsed,
        videoElements,
        renderer,
      );

      if (elapsed >= totalDuration) {
        setTimeout(() => recorder.stop(), STOP_DELAY_MS);
        return;
      }

      animationFrameId = requestAnimationFrame(renderFrame);
    };

    recorder.start(RECORDER_TIMESLICE_MS);
    animationFrameId = requestAnimationFrame(renderFrame);
  });
}

function reportProgress(
  onProgress: ExportProgressCallback | undefined,
  elapsed: number,
  totalDuration: number,
): void {
  onProgress?.({
    currentTime: elapsed,
    totalDuration,
    percentage: Math.min(100, Math.round((elapsed / totalDuration) * 100)),
  });
}

/**
 * Advances clip index forward if elapsed time has passed current clip's end.
 *
 * Since time only moves forward during export, we never need to go backwards.
 * This gives O(1) amortized lookup instead of O(n) search per frame.
 */
function advanceClipIndex(
  currentIndex: number,
  boundaries: ClipBoundary[],
  elapsed: number,
): number {
  let index = currentIndex;
  while (index < boundaries.length && elapsed >= boundaries[index].end) {
    index++;
  }
  return index;
}

/**
 * Renders a single frame to the canvas.
 *
 * Syncs the video element to the correct source time, updates the WebGL
 * renderer with the current video frame, and applies color isolation
 * effect if a mask exists for the current time.
 */
function renderCurrentFrame(
  clipData: ClipBoundary | undefined,
  elapsed: number,
  videoElements: Map<string, HTMLVideoElement>,
  renderer: ColorIsolationRenderer,
): void {
  if (!clipData || elapsed < clipData.start || elapsed >= clipData.end) {
    renderer.clear();
    return;
  }

  const video = videoElements.get(clipData.clip.sourceId);
  if (!video) {
    renderer.clear();
    return;
  }

  const sourceTime = calculateSourceTime(clipData, elapsed);
  syncVideoPlayback(video, sourceTime);
  renderer.updateVideo(video);
  renderWithMask(renderer, clipData.regions, sourceTime);
}

/**
 * Maps timeline elapsed time to source video time.
 *
 * Accounts for the clip's position on the timeline and its in-point
 * (where playback starts in the source video).
 */
function calculateSourceTime(clipData: ClipBoundary, elapsed: number): number {
  const clipOffset = elapsed - clipData.start;
  return clipData.clip.sourceInPointSeconds + clipOffset;
}

/**
 * Keeps video element in sync with expected source time.
 *
 * Only seeks if drift exceeds threshold (0.1s) to avoid constant seeking.
 * Also ensures video is playing (may pause due to browser policies).
 */
function syncVideoPlayback(video: HTMLVideoElement, sourceTime: number): void {
  if (Math.abs(video.currentTime - sourceTime) > SEEK_THRESHOLD_SECONDS) {
    video.currentTime = sourceTime;
  }
  if (video.paused) {
    video.play();
  }
}

/**
 * Renders the frame with or without color isolation effect.
 *
 * If a mask exists for the current source time, applies color isolation
 * (subject in color, background grayscale). Otherwise renders video directly.
 */
function renderWithMask(
  renderer: ColorIsolationRenderer,
  regions: ColorRegion[],
  sourceTime: number,
): void {
  const mask = getMaskForClip(regions, sourceTime);

  if (mask) {
    renderer.updateMask(mask);
    renderer.render();
  } else {
    renderer.updateMask(null);
    renderer.renderPassthrough();
  }
}

/**
 * Finds the appropriate mask for the current source time.
 *
 * Searches through all color regions for the clip and returns the
 * closest mask to the requested time (masks are sampled at processing FPS).
 */
function getMaskForClip(regions: ColorRegion[], sourceTime: number): MaskData | null {
  for (const region of regions) {
    if (region.frameMasks.length > 0) {
      const frameMask = getMaskForTime(region.frameMasks, sourceTime);
      if (frameMask) return frameMask.mask;
    }
  }
  return null;
}

/**
 * Calculates total timeline duration from all clips.
 *
 * Uses source in/out points (not trimmed field) since those define
 * the actually visible/exported portion of each clip.
 */
function calculateTotalDuration(clips: TimelineClip[]): number {
  return clips.reduce(
    (total, clip) => total + (clip.sourceOutPointSeconds - clip.sourceInPointSeconds),
    0,
  );
}

/**
 * Determines output resolution from all clips.
 *
 * Uses the maximum width and height across all sources to avoid
 * cropping any content. Rounds to even numbers for codec compatibility.
 */
function getOutputResolution(
  clips: TimelineClip[],
  getSource: (sourceId: string) => VideoSource | undefined,
): { width: number; height: number } {
  let maxWidth = 0;
  let maxHeight = 0;

  for (const clip of clips) {
    const source = getSource(clip.sourceId);
    if (source?.widthInPixels && source?.heightInPixels) {
      maxWidth = Math.max(maxWidth, source.widthInPixels);
      maxHeight = Math.max(maxHeight, source.heightInPixels);
    }
  }

  return {
    width: Math.floor(maxWidth / 2) * 2,
    height: Math.floor(maxHeight / 2) * 2,
  };
}

/**
 * Gets the maximum frame rate across all clips.
 *
 * Uses the highest frame rate to avoid dropping frames from
 * high-FPS sources. Falls back to 30fps if detection failed.
 */
function getMaxFrameRate(
  clips: TimelineClip[],
  getSource: (sourceId: string) => VideoSource | undefined,
): number {
  let maxFrameRate = 0;

  for (const clip of clips) {
    const source = getSource(clip.sourceId);
    if (source?.frameRate) {
      maxFrameRate = Math.max(maxFrameRate, source.frameRate);
    }
  }

  return maxFrameRate > 0 ? maxFrameRate : DEFAULT_FRAME_RATE;
}

/**
 * Detects the best supported WebM codec for recording.
 *
 * Prefers VP9 (better compression) over VP8, with Opus audio.
 * Falls back to basic WebM if no specific codec is supported.
 */
function getSupportedMimeType(): string {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  throw new Error('No supported video format found for MediaRecorder');
}

/**
 * Triggers a browser download for the given blob.
 *
 * Creates a temporary object URL and anchor element to initiate
 * the download, then cleans up resources.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
