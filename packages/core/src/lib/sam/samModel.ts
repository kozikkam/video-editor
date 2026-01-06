import { SamModel, AutoProcessor, RawImage, type Tensor } from '@huggingface/transformers';
import type { MaskData } from '../../types';

const MODEL_ID = 'Xenova/sam-vit-base';

type SamProcessedInputs = Record<string, unknown> & {
  original_sizes: Tensor;
  reshaped_input_sizes: Tensor;
};

type SamOutputs = {
  pred_masks: Tensor;
};

type SamProcessor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> & {
  post_process_masks: (
    masks: Tensor,
    originalSizes: Tensor,
    reshapedSizes: Tensor,
  ) => Promise<Tensor[][]>;
};

let model: Awaited<ReturnType<typeof SamModel.from_pretrained>> | null = null;
let processor: SamProcessor | null = null;

export async function loadModels(): Promise<void> {
  if (model && processor) return;

  console.log(`Loading SAM model: ${MODEL_ID}...`);
  model = await SamModel.from_pretrained(MODEL_ID, {
    dtype: 'fp16',
    device: 'webgpu',
  });
  processor = (await AutoProcessor.from_pretrained(MODEL_ID)) as SamProcessor;
  console.log('SAM model loaded');
}

export function isLoaded(): boolean {
  return model !== null && processor !== null;
}

export async function segment(
  imageData: ImageData,
  pointX: number,
  pointY: number,
): Promise<MaskData | null> {
  if (!model || !processor) {
    throw new Error('Model not loaded');
  }

  // Create RawImage from ImageData, convert to Uint8ClampedArray
  const image = new RawImage(
    // Uint8ClampedArray is a typed array of 8-bit unsigned integers that are clamped to the range 0-255
    // This is necessary because the image data is in the range 0-255
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
    4, // 4 channels (RGBA)
  );

  const inputs = (await processor(image, {
    input_points: [[[[pointX, pointY]]]], // [batch=1][object=1][points=1][xy]
    input_labels: [[[1]]], // [batch=1][object=1][labels=1]
  } as unknown as Record<string, unknown>)) as unknown as SamProcessedInputs;

  const outputs = (await model(inputs as unknown as Record<string, unknown>)) as unknown as SamOutputs;

  const masks = await processor.post_process_masks(
    outputs.pred_masks,
    inputs.original_sizes,
    inputs.reshaped_input_sizes,
  );

  // Best mask (first one has highest score)
  const mask = masks?.[0]?.[0] as Tensor | undefined;
  if (!mask) return null;

  const dims = mask.dims;
  const height = dims[dims.length - 2];
  const width = dims[dims.length - 1];
  const raw = mask.data as ArrayLike<number>;

  const data = new Uint8Array(raw.length);
  let hasContent = false;
  for (let i = 0; i < raw.length; i++) {
    const on = (raw[i] as number) > 0 ? 1 : 0;
    data[i] = on;
    if (on) hasContent = true;
  }

  if (!hasContent) return null;

  return { data, width, height };
}
