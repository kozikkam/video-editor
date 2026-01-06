import { ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision';

// Bounding box for object detection (internal to tracking)
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedObject {
  box: BoundingBox;
  category: string;
  score: number;
}


let detector: ObjectDetector | null = null;

/**
 * Calculates the IoU (Intersection over Union) between two bounding boxes.
 * 
 * @param box1 - The first bounding box.
 * @param box2 - The second bounding box.
 * @returns The IoU between the two bounding boxes.
 */
function calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  if (x2 <= x1 || y2 <= y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const area1 = box1.width * box1.height;
  const area2 = box2.width * box2.height;
  const union = area1 + area2 - intersection;

  return intersection / union;
}

/**
 * Checks if a point is inside a bounding box.
 * 
 * @param x - The x coordinate of the point.
 * @param y - The y coordinate of the point.
 * @param box - The bounding box.
 * @returns True if the point is inside the bounding box, false otherwise.
 */
function isPointInBox(x: number, y: number, box: BoundingBox): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

/**
 * Loads the MediaPipe Object Detector.
 * 
 * @returns void
 */
export async function loadObjectDetector(): Promise<void> {
  if (detector) return;

  console.log('Loading MediaPipe Object Detector...');
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  );

  detector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    scoreThreshold: 0.3,
    maxResults: 20,
  });
  console.log('MediaPipe Object Detector loaded');
}

/**
 * Detects objects in an image using the MediaPipe Object Detector.
 * 
 * @param imageData - The image data to detect objects in.
 * @returns Detected objects.
 */
export function detectObjects(imageData: ImageData): DetectedObject[] {
  if (!detector) return [];

  // Create canvas for detection
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);

  const result = detector.detect(canvas);

  return result.detections.map((det) => {
    const bbox = det.boundingBox!;
    return {
      box: {
        x: bbox.originX,
        y: bbox.originY,
        width: bbox.width,
        height: bbox.height,
      },
      category: det.categories[0]?.categoryName || 'unknown',
      score: det.categories[0]?.score || 0,
    };
  });
}

/**
 * Finds the object that contains the clicked point.
 * 
 * @param objects - The detected objects.
 * @param x - The x coordinate of the point.
 * @param y - The y coordinate of the point.
 * @returns The object that contains the clicked point.
 */
export function findObjectAtPoint(
  objects: DetectedObject[],
  x: number,
  y: number,
): DetectedObject | null {
  // Find all objects containing the point, return the smallest (most specific)
  const containing = objects.filter((obj) => isPointInBox(x, y, obj.box));
  if (containing.length === 0) return null;

  // Return the smallest box (most specific object)
  return containing.reduce((smallest, current) => {
    const smallestArea = smallest.box.width * smallest.box.height;
    const currentArea = current.box.width * current.box.height;
    return currentArea < smallestArea ? current : smallest;
  });
}

/**
 * Tracks an object from one frame to the next using IoU matching.
 * 
 * @param previousBox - The bounding box of the previous frame.
 * @param currentFrameObjects - The detected objects in the current frame.
 * @param iouThreshold - The IoU threshold for matching objects.
 * @returns The tracked object.
 */
export function trackObject(
  previousBox: BoundingBox,
  currentFrameObjects: DetectedObject[],
  iouThreshold: number = 0.3,
): DetectedObject | null {
  if (currentFrameObjects.length === 0) return null;

  let bestMatch: DetectedObject | null = null;
  let bestIoU = iouThreshold;

  for (const obj of currentFrameObjects) {
    const iou = calculateIoU(previousBox, obj.box);
    if (iou > bestIoU) {
      bestIoU = iou;
      bestMatch = obj;
    }
  }

  return bestMatch;
}

/**
 * Gets the center point of a bounding box.
 * 
 * @param box - The bounding box.
 * @returns The center point of the bounding box.
 */
export function getBoxCenter(box: BoundingBox): { x: number; y: number } {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}
