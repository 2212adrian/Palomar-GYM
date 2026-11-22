// src/lib/scannerWorker.ts
import * as ZXingNS from 'html5-qrcode/third_party/zxing-js.umd';

type WorkerScannerMode = 'qr' | 'barcode' | 'hybrid';

export interface WorkerDecodeRequest {
  id: number;
  rgbaBuffer: ArrayBuffer;
  width: number;
  height: number;
  mode: WorkerScannerMode;
  tick: number;
}

export interface WorkerDecodeResponse {
  id: number;
  result: { text: string; format?: string } | null;
}

const ZX =
  (ZXingNS as unknown as { BarcodeFormat?: typeof ZXingNS.BarcodeFormat }).BarcodeFormat
    ? ZXingNS
    : ((ZXingNS as unknown as { default?: typeof ZXingNS }).default ?? ZXingNS);

const FORMAT_NAMES: Record<number, string> = {
  [ZX.BarcodeFormat.QR_CODE]: 'QR_CODE',
  [ZX.BarcodeFormat.DATA_MATRIX]: 'DATA_MATRIX',
  [ZX.BarcodeFormat.AZTEC]: 'AZTEC',
  [ZX.BarcodeFormat.PDF_417]: 'PDF_417',
  [ZX.BarcodeFormat.CODE_128]: 'CODE_128',
  [ZX.BarcodeFormat.CODE_39]: 'CODE_39',
  [ZX.BarcodeFormat.CODE_93]: 'CODE_93',
  [ZX.BarcodeFormat.EAN_13]: 'EAN_13',
  [ZX.BarcodeFormat.EAN_8]: 'EAN_8',
  [ZX.BarcodeFormat.UPC_A]: 'UPC_A',
  [ZX.BarcodeFormat.UPC_E]: 'UPC_E',
  [ZX.BarcodeFormat.ITF]: 'ITF',
  [ZX.BarcodeFormat.CODABAR]: 'CODABAR',
};

const QR_FORMATS = [
  ZX.BarcodeFormat.QR_CODE,
  ZX.BarcodeFormat.DATA_MATRIX,
  ZX.BarcodeFormat.AZTEC,
];

const BARCODE_FORMATS = [
  ZX.BarcodeFormat.CODE_128,
  ZX.BarcodeFormat.CODE_39,
  ZX.BarcodeFormat.CODE_93,
  ZX.BarcodeFormat.EAN_13,
  ZX.BarcodeFormat.EAN_8,
  ZX.BarcodeFormat.UPC_A,
  ZX.BarcodeFormat.UPC_E,
  ZX.BarcodeFormat.ITF,
  ZX.BarcodeFormat.CODABAR,
  ZX.BarcodeFormat.PDF_417,
];

const ALL_FORMATS = [...QR_FORMATS, ...BARCODE_FORMATS];

const reader = new ZX.MultiFormatReader(false);
let activeHintKey = '';

// Reusable scratch buffers inside worker to avoid GC churn
let lumBuffer: Uint8ClampedArray = new Uint8ClampedArray(0);
let rotLumBuffer: Uint8ClampedArray = new Uint8ClampedArray(0);

function ensureHints(mode: WorkerScannerMode, tryHarder: boolean) {
  const nextKey = `${mode}:${tryHarder ? 1 : 0}`;
  if (activeHintKey === nextKey) return;
  activeHintKey = nextKey;

  const hints = new Map<number, unknown>();
  const formats =
    mode === 'qr'
      ? QR_FORMATS
      : mode === 'barcode'
        ? BARCODE_FORMATS
        : ALL_FORMATS;

  hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, formats);
  hints.set(ZX.DecodeHintType.TRY_HARDER, tryHarder);
  reader.setHints(hints);
}

function rgbaToLuminance(
  rgba: Uint8ClampedArray,
  pixelCount: number,
  boostContrast: boolean
): Uint8ClampedArray {
  if (lumBuffer.length < pixelCount) {
    lumBuffer = new Uint8ClampedArray(pixelCount);
  }
  const out = lumBuffer.subarray(0, pixelCount);

  if (boostContrast) {
    for (let i = 0, j = 0; j < pixelCount; i += 4, j++) {
      const gray = (306 * rgba[i] + 601 * rgba[i + 1] + 117 * rgba[i + 2] + 512) >> 10;
      const boosted = ((gray - 128) * 345) >> 8;
      const val = boosted + 128;
      out[j] = val < 0 ? 0 : val > 255 ? 255 : val;
    }
  } else {
    for (let i = 0, j = 0; j < pixelCount; i += 4, j++) {
      out[j] = (306 * rgba[i] + 601 * rgba[i + 1] + 117 * rgba[i + 2] + 512) >> 10;
    }
  }

  return out;
}

function rotate90Luminance(
  src: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const total = width * height;
  if (rotLumBuffer.length < total) {
    rotLumBuffer = new Uint8ClampedArray(total);
  }
  const dst = rotLumBuffer.subarray(0, total);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const dstX = height - 1 - y;
    for (let x = 0; x < width; x++) {
      dst[x * height + dstX] = src[rowOffset + x];
    }
  }
  return dst;
}

function extractResult(
  res: ZXingNS.ZXingDecodedResult | null | undefined
): { text: string; format?: string } | null {
  if (!res) return null;
  const text = res.getText ? res.getText() : res.text;
  if (!text) return null;
  const fmt = res.getBarcodeFormat ? res.getBarcodeFormat() : res.format;
  return { text, format: FORMAT_NAMES[fmt] };
}

function decodeLuminance(
  luminances: Uint8ClampedArray,
  width: number,
  height: number,
  useGlobal: boolean,
  tryInverted: boolean
): { text: string; format?: string } | null {
  const source = new ZX.RGBLuminanceSource(luminances, width, height);

  // 1. Primary pass (HybridBinarizer or GlobalHistogramBinarizer rotated across ticks)
  try {
    const binarizer = useGlobal
      ? new ZX.GlobalHistogramBinarizer(source)
      : new ZX.HybridBinarizer(source);
    const decoded = extractResult(
      reader.decodeWithState(new ZX.BinaryBitmap(binarizer))
    );
    if (decoded) return decoded;
  } catch {
    // Expected NotFoundException when frame has no code
  }

  // 2. Alternate inverted pass only periodically for light-on-dark QR displays
  if (tryInverted) {
    try {
      const inv = new ZX.InvertedLuminanceSource(source);
      const decoded = extractResult(
        reader.decodeWithState(new ZX.BinaryBitmap(new ZX.HybridBinarizer(inv)))
      );
      if (decoded) return decoded;
    } catch {
      // Ignore
    }
  }

  return null;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerDecodeRequest>) => void) | null;
  postMessage: (message: WorkerDecodeResponse) => void;
};

workerScope.onmessage = (event: MessageEvent<WorkerDecodeRequest>) => {
  const { id, rgbaBuffer, width, height, mode, tick } = event.data;

  try {
    const rgba = new Uint8ClampedArray(rgbaBuffer);
    const pixelCount = width * height;
    const boostContrast = tick % 2 === 1;
    const luminances = rgbaToLuminance(rgba, pixelCount, boostContrast);

    // Specialize formats on 5 of 6 ticks for speed, with periodic hybrid pass in case user holds the opposite code type
    const effectiveMode: WorkerScannerMode =
      mode === 'hybrid'
        ? tick % 3 === 0
          ? 'hybrid'
          : tick % 2 === 0
            ? 'qr'
            : 'barcode'
        : tick % 6 === 5
          ? 'hybrid'
          : mode;
    const tryHarder = tick % 3 === 2;
    ensureHints(effectiveMode, tryHarder);

    const useGlobal =
      effectiveMode === 'barcode'
        ? tick % 2 === 1
        : tick % 4 === 1;
    const tryInverted =
      (effectiveMode === 'qr' || effectiveMode === 'hybrid') && tick % 4 === 3;

    let result = decodeLuminance(luminances, width, height, useGlobal, tryInverted);

    // Vertical barcode rescue every 4th tick without touching any DOM canvas
    if (
      !result &&
      (effectiveMode === 'barcode' || effectiveMode === 'hybrid') &&
      tick % 4 === 2
    ) {
      const rotated = rotate90Luminance(luminances, width, height);
      result = decodeLuminance(rotated, height, width, true, false);
    }

    workerScope.postMessage({ id, result });
  } catch {
    workerScope.postMessage({ id, result: null });
  }
};
