declare module 'html5-qrcode/third_party/zxing-js.umd' {
  export const BarcodeFormat: {
    readonly AZTEC: number;
    readonly CODABAR: number;
    readonly CODE_39: number;
    readonly CODE_93: number;
    readonly CODE_128: number;
    readonly DATA_MATRIX: number;
    readonly EAN_8: number;
    readonly EAN_13: number;
    readonly ITF: number;
    readonly MAXICODE: number;
    readonly PDF_417: number;
    readonly QR_CODE: number;
    readonly RSS_14: number;
    readonly RSS_EXPANDED: number;
    readonly UPC_A: number;
    readonly UPC_E: number;
    readonly UPC_EAN_EXTENSION: number;
  };

  export const DecodeHintType: {
    readonly POSSIBLE_FORMATS: number;
    readonly TRY_HARDER: number;
    readonly ALSO_INVERTED?: number;
  };

  export class RGBLuminanceSource {
    constructor(
      luminances: Uint8ClampedArray | Int32Array,
      width: number,
      height: number,
      dataWidth?: number,
      dataHeight?: number,
      left?: number,
      top?: number
    );
  }

  export class HTMLCanvasElementLuminanceSource {
    constructor(canvas: HTMLCanvasElement);
  }

  type AnyLuminanceSource =
    | HTMLCanvasElementLuminanceSource
    | RGBLuminanceSource
    | InvertedLuminanceSource;

  export class InvertedLuminanceSource {
    constructor(delegate: HTMLCanvasElementLuminanceSource | RGBLuminanceSource);
  }

  export class HybridBinarizer {
    constructor(source: AnyLuminanceSource);
  }

  export class GlobalHistogramBinarizer {
    constructor(source: AnyLuminanceSource);
  }

  export class BinaryBitmap {
    constructor(binarizer: HybridBinarizer | GlobalHistogramBinarizer);
  }

  export interface ZXingDecodedResult {
    text: string;
    format: number;
    getText?: () => string;
    getBarcodeFormat?: () => number;
  }

  export class MultiFormatReader {
    constructor(verbose?: boolean, hints?: Map<number, unknown> | null);
    setHints(hints: Map<number, unknown> | null): void;
    decode(image: BinaryBitmap, hints?: Map<number, unknown> | null): ZXingDecodedResult;
    decodeWithState(image: BinaryBitmap): ZXingDecodedResult;
    reset(): void;
  }
}
