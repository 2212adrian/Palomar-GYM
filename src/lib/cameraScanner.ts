// src/lib/cameraScanner.ts
import * as ZXingNS from 'html5-qrcode/third_party/zxing-js.umd';
import type { WorkerDecodeRequest, WorkerDecodeResponse } from './scannerWorker';

const ZX =
  (ZXingNS as unknown as { BarcodeFormat?: typeof ZXingNS.BarcodeFormat }).BarcodeFormat
    ? ZXingNS
    : ((ZXingNS as unknown as { default?: typeof ZXingNS }).default ?? ZXingNS);

export interface CameraDeviceInfo {
  id: string;
  label: string;
}

export type ScannerMode = 'qr' | 'barcode' | 'hybrid';

export interface CameraScannerStartOptions {
  containerId: string;
  mode?: ScannerMode;
  deviceId?: string;
  facingMode?: 'environment' | 'user';
  fps?: number;
  onDecode: (decodedText: string, formatName?: string) => void;
  onError?: (err: unknown) => void;
  onStreamReady?: (info: {
    hasTorch: boolean;
    activeDeviceId: string;
    cameras: CameraDeviceInfo[];
  }) => void;
}

interface NativeBarcodeResult {
  rawValue?: string;
  format?: string;
}

interface NativeBarcodeDetector {
  detect: (source: CanvasImageSource) => Promise<NativeBarcodeResult[]>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

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

const NATIVE_FORMATS = [
  'qr_code',
  'data_matrix',
  'aztec',
  'pdf417',
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'codabar',
];

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

export const getFriendlyCameraError = (err: unknown): string => {
  const msg =
    typeof err === 'string'
      ? err
      : (err as { message?: string })?.message || String(err || '');
  const lower = msg.toLowerCase();
  if (lower.includes('notallowederror') || lower.includes('permission')) {
    return 'Permission denied by browser';
  }
  if (
    lower.includes('notreadableerror') ||
    lower.includes('trackstart') ||
    lower.includes('in use')
  ) {
    return 'Camera is busy or in use';
  }
  if (lower.includes('notfounderror') || lower.includes('devicesnotfound')) {
    return 'Camera hardware not found';
  }
  if (lower.includes('overconstrainederror')) {
    return 'Requested camera constraints unavailable';
  }
  return msg || 'Camera initialization failed';
};

export const listVideoCameras = async (): Promise<CameraDeviceInfo[]> => {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== 'function'
  ) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput' && Boolean(d.deviceId))
      .map((d, idx) => ({
        id: d.deviceId,
        label: d.label?.trim() || `Camera ${idx + 1}`,
      }));
  } catch {
    return [];
  }
};

export const stopMediaStreamTracks = (containerId?: string) => {
  if (typeof document === 'undefined') return;
  const scope = containerId ? document.getElementById(containerId) : document;
  const videos = scope
    ? scope.querySelectorAll('video')
    : document.querySelectorAll('video');

  videos.forEach((video) => {
    const mediaStream = video.srcObject as MediaStream | null;
    if (mediaStream && typeof mediaStream.getTracks === 'function') {
      mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch {
          // Ignore track stop errors
        }
      });
    }
    video.srcObject = null;
  });
};

export class CameraBarcodeScanner {
  private containerId: string | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private activeTrack: MediaStreamTrack | null = null;

  // Off-main-thread Worker & fallback reader
  private worker: Worker | null = null;
  private workerDisabled = false;
  private workerJobId = 0;
  private pendingWorkerJobs = new Map<
    number,
    (res: { text: string; format?: string } | null) => void
  >();
  private fallbackReader: ZXingNS.MultiFormatReader | null = null;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private nativeDetector: NativeBarcodeDetector | null = null;
  private nativeDetectorFailures = 0;
  private nativeInitStarted = false;

  private mode: ScannerMode = 'hybrid';
  private fps = 10;
  private isRunning = false;
  private isDecodingFrame = false;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private tickCount = 0;
  private onDecodeCb: ((text: string, format?: string) => void) | null = null;
  private stopPromise: Promise<void> | null = null;
  private runToken = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', {
      willReadFrequently: true,
      alpha: false,
    });
  }

  private ensureWorker(): Worker | null {
    if (this.workerDisabled || typeof Worker === 'undefined') {
      return null;
    }
    if (this.worker) {
      return this.worker;
    }

    try {
      const w = new Worker(new URL('./scannerWorker.ts', import.meta.url), {
        type: 'module',
      });
      w.onmessage = (event: MessageEvent<WorkerDecodeResponse>) => {
        const { id, result } = event.data || {};
        const resolver = this.pendingWorkerJobs.get(id);
        if (resolver) {
          this.pendingWorkerJobs.delete(id);
          resolver(result ?? null);
        }
      };
      w.onerror = () => {
        this.workerDisabled = true;
        this.terminateWorker();
      };
      this.worker = w;
      return w;
    } catch {
      this.workerDisabled = true;
      return null;
    }
  }

  private terminateWorker() {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    this.pendingWorkerJobs.forEach((resolve) => resolve(null));
    this.pendingWorkerJobs.clear();
  }

  private getFallbackReader(): ZXingNS.MultiFormatReader {
    if (!this.fallbackReader) {
      this.fallbackReader = new ZX.MultiFormatReader(false);
      this.applyFallbackHints(this.mode);
    }
    return this.fallbackReader;
  }

  private applyFallbackHints(mode: ScannerMode) {
    if (!this.fallbackReader) return;
    const hints = new Map<number, unknown>();
    const formats =
      mode === 'qr'
        ? QR_FORMATS
        : mode === 'barcode'
          ? BARCODE_FORMATS
          : ALL_FORMATS;
    hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(ZX.DecodeHintType.TRY_HARDER, false);
    this.fallbackReader.setHints(hints);
  }

  public setMode(mode: ScannerMode) {
    if (this.mode !== mode) {
      this.mode = mode;
      this.applyFallbackHints(mode);
    }
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoEl;
  }

  private async initNativeDetector() {
    if (this.nativeInitStarted || typeof window === 'undefined') return;
    this.nativeInitStarted = true;

    const DetectorCtor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
    ).BarcodeDetector;

    if (!DetectorCtor) return;

    try {
      let formatsToUse = ['qr_code', 'ean_13', 'code_128', 'code_39', 'upc_a'];
      if (typeof DetectorCtor.getSupportedFormats === 'function') {
        const supported = await DetectorCtor.getSupportedFormats();
        if (!Array.isArray(supported) || supported.length === 0) {
          return;
        }
        const filtered = NATIVE_FORMATS.filter((f) => supported.includes(f));
        if (filtered.length === 0) return;
        formatsToUse = filtered;
      }

      const detector = new DetectorCtor({ formats: formatsToUse });
      if (detector) {
        this.nativeDetector = detector;
      }
    } catch {
      this.nativeDetector = null;
    }
  }

  private async requestCameraStream(
    deviceId?: string,
    facingMode: 'environment' | 'user' = 'environment'
  ): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera streaming is not supported in this browser.');
    }

    const attempts: MediaStreamConstraints[] = [];

    if (deviceId) {
      attempts.push({
        audio: false,
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      attempts.push({
        audio: false,
        video: { deviceId: { exact: deviceId } },
      });
    } else {
      attempts.push({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      attempts.push({
        audio: false,
        video: { facingMode: { ideal: facingMode } },
      });
      attempts.push({
        audio: false,
        video: true,
      });
    }

    let lastError: unknown;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastError = err;
        const name = (err as { name?: string })?.name || '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          throw err;
        }
      }
    }

    throw lastError || new Error('Unable to access camera stream.');
  }

  public async start(options: CameraScannerStartOptions): Promise<void> {
    await this.stop();

    const currentToken = ++this.runToken;
    this.containerId = options.containerId;
    // Cap active decode rate around ~10-12Hz: plenty responsive (<100ms detection) with zero UI stutter
    this.fps = Math.max(5, Math.min(14, options.fps || 10));
    this.onDecodeCb = options.onDecode;
    this.setMode(options.mode || 'hybrid');

    const container = document.getElementById(options.containerId);
    if (!container) {
      throw new Error(`Scanner container #${options.containerId} not found.`);
    }

    // Warm up the background decode worker while camera hardware opens
    this.ensureWorker();

    let mediaStream: MediaStream;
    try {
      mediaStream = await this.requestCameraStream(
        options.deviceId,
        options.facingMode || 'environment'
      );
    } catch (err) {
      if (currentToken === this.runToken) {
        options.onError?.(err);
      }
      throw err;
    }

    if (currentToken !== this.runToken) {
      mediaStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      return;
    }

    this.stream = mediaStream;
    const videoTracks = mediaStream.getVideoTracks();
    this.activeTrack = videoTracks[0] || null;

    if (this.activeTrack && typeof this.activeTrack.getCapabilities === 'function') {
      try {
        const caps = this.activeTrack.getCapabilities() as MediaTrackCapabilities & {
          focusMode?: string[];
        };
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          this.activeTrack
            .applyConstraints({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            })
            .catch(() => {});
        }
      } catch {
        // Focus constraint optional
      }
    }

    container.innerHTML = '';
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.setAttribute('muted', 'true');
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.position = 'absolute';
    video.style.inset = '0';
    video.style.display = 'block';
    video.style.pointerEvents = 'none';
    video.style.transform = 'translateZ(0)';
    video.srcObject = mediaStream;

    container.appendChild(video);
    this.videoEl = video;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', handleReady);
        video.removeEventListener('playing', handleReady);
        video.removeEventListener('error', handleErr);
      };
      const handleReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const handleErr = (e: Event) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(e);
      };

      video.addEventListener('loadedmetadata', handleReady);
      video.addEventListener('playing', handleReady);
      video.addEventListener('error', handleErr);

      video.play().then(() => {
        if (video.readyState >= 2 && video.videoWidth > 0) {
          handleReady();
        }
      }).catch((playErr) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(playErr);
        }
      });

      setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      }, 1500);
    });

    if (currentToken !== this.runToken) {
      await this.stop();
      return;
    }

    void this.initNativeDetector();

    let hasTorch = false;
    let activeDeviceId = options.deviceId || '';
    try {
      if (this.activeTrack) {
        const settings = this.activeTrack.getSettings?.();
        if (settings?.deviceId) activeDeviceId = settings.deviceId;
        const caps = this.activeTrack.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined;
        hasTorch = Boolean(caps?.torch);
      }
    } catch {
      // ignore capabilities check failure
    }

    const cameras = await listVideoCameras();
    if (currentToken !== this.runToken) {
      await this.stop();
      return;
    }

    options.onStreamReady?.({
      hasTorch,
      activeDeviceId,
      cameras,
    });

    this.isRunning = true;
    this.tickCount = 0;
    this.scheduleNextTick(80);
  }

  public async toggleTorch(enabled: boolean): Promise<boolean> {
    if (!this.activeTrack) {
      throw new Error('No active camera track.');
    }
    await this.activeTrack.applyConstraints({
      advanced: [{ torch: enabled } as MediaTrackConstraintSet],
    });
    return enabled;
  }

  private scheduleNextTick(delayMs?: number) {
    if (!this.isRunning) return;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    const interval = delayMs ?? Math.max(80, Math.round(1000 / this.fps));
    this.scanTimer = setTimeout(() => {
      void this.scanFrame();
    }, interval);
  }

  private decodeInWorker(
    imageData: ImageData,
    mode: ScannerMode,
    tick: number
  ): Promise<{ text: string; format?: string } | null> {
    const worker = this.ensureWorker();
    if (!worker) {
      return Promise.resolve(this.decodeFallbackMainThread());
    }

    const jobId = ++this.workerJobId;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.pendingWorkerJobs.delete(jobId)) {
          resolve(null);
        }
      }, 600);

      this.pendingWorkerJobs.set(jobId, (res) => {
        clearTimeout(timeout);
        resolve(res);
      });

      const buffer = imageData.data.buffer;
      const msg: WorkerDecodeRequest = {
        id: jobId,
        rgbaBuffer: buffer,
        width: imageData.width,
        height: imageData.height,
        mode,
        tick,
      };
      try {
        worker.postMessage(msg, [buffer]);
      } catch {
        clearTimeout(timeout);
        this.pendingWorkerJobs.delete(jobId);
        resolve(this.decodeFallbackMainThread());
      }
    });
  }

  private decodeFallbackMainThread(): { text: string; format?: string } | null {
    try {
      const reader = this.getFallbackReader();
      const source = new ZX.HTMLCanvasElementLuminanceSource(this.canvas);
      const bitmap = new ZX.BinaryBitmap(new ZX.HybridBinarizer(source));
      const res = reader.decodeWithState(bitmap);
      const text = res?.getText ? res.getText() : res?.text;
      if (text) {
        const fmt = res?.getBarcodeFormat ? res.getBarcodeFormat() : res?.format;
        return { text, format: FORMAT_NAMES[fmt] };
      }
    } catch {
      // Expected miss
    }
    return null;
  }

  private async scanFrame() {
    if (!this.isRunning || this.isDecodingFrame) return;

    if (typeof document !== 'undefined' && document.hidden) {
      this.scheduleNextTick(250);
      return;
    }

    const video = this.videoEl;
    if (
      !video ||
      video.readyState < 2 ||
      video.videoWidth === 0 ||
      video.videoHeight === 0 ||
      video.paused ||
      !this.ctx
    ) {
      this.scheduleNextTick(120);
      return;
    }

    this.isDecodingFrame = true;
    const frameStart = performance.now();
    const tick = this.tickCount++;

    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cw = video.clientWidth || vw;
      const ch = video.clientHeight || vh;

      // Exact visible region produced by CSS `object-fit: cover` in native sensor pixels (1:1 aspect ratio)
      const coverScale = Math.max(cw / vw, ch / vh);
      const visW = Math.min(vw, cw / coverScale);
      const visH = Math.min(vh, ch / coverScale);
      const visX = Math.max(0, (vw - visW) / 2);
      const visY = Math.max(0, (vh - visH) / 2);

      // Every 4th tick scans the full visible viewport; others zoom tightly into reticle crop
      const scanFullVisibleFrame = tick % 4 === 3;
      let sx = visX;
      let sy = visY;
      let sw = visW;
      let sh = visH;

      if (!scanFullVisibleFrame) {
        if (this.mode === 'qr') {
          const side = Math.min(visW, visH) * 0.84;
          sw = side;
          sh = side;
          sx = visX + (visW - side) / 2;
          sy = visY + (visH - side) / 2;
        } else if (this.mode === 'barcode') {
          sw = visW * 0.92;
          sh = Math.max(Math.min(visH * 0.48, 380), Math.min(visH, 160));
          sx = visX + (visW - sw) / 2;
          sy = visY + (visH - sh) / 2;
        } else {
          sw = visW * 0.9;
          sh = visH * 0.82;
          sx = visX + (visW - sw) / 2;
          sy = visY + (visH - sh) / 2;
        }
      }

      // 520px-600px preserves crisp bar/module clarity while reducing pixel processing by ~3x vs 960px
      const maxDim = scanFullVisibleFrame ? 600 : 520;
      const downscale = Math.min(1, maxDim / Math.max(sw, sh));
      const dstW = Math.max(120, Math.round(sw * downscale));
      const dstH = Math.max(120, Math.round(sh * downscale));

      if (this.canvas.width !== dstW || this.canvas.height !== dstH) {
        this.canvas.width = dstW;
        this.canvas.height = dstH;
      }

      // Fast raw pixel draw — no software ctx.filter on main thread!
      this.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dstW, dstH);

      let matched: { text: string; format?: string } | null = null;

      // Native hardware BarcodeDetector runs out-of-process async when supported
      if (
        this.nativeDetector &&
        this.nativeDetectorFailures < 3 &&
        tick % 2 === 0
      ) {
        try {
          const barcodes = await this.nativeDetector.detect(this.canvas);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            this.nativeDetectorFailures = 0;
            matched = {
              text: barcodes[0].rawValue,
              format: barcodes[0].format?.toUpperCase(),
            };
          }
        } catch {
          this.nativeDetectorFailures += 1;
        }
      }

      // Offload ZXing pixel luminance + multi-pass decode completely off main thread into Worker
      if (!matched && this.isRunning) {
        const imageData = this.ctx.getImageData(0, 0, dstW, dstH);
        matched = await this.decodeInWorker(imageData, this.mode, tick);
      }

      if (matched && this.isRunning) {
        this.onDecodeCb?.(matched.text, matched.format);
      }
    } catch {
      // Ignore transient frame decode exceptions
    } finally {
      this.isDecodingFrame = false;
      if (this.isRunning) {
        const minInterval = Math.max(85, Math.round(1000 / this.fps));
        const elapsed = performance.now() - frameStart;
        const nextDelay = Math.max(20, Math.round(minInterval - elapsed));
        this.scheduleNextTick(nextDelay);
      }
    }
  }

  public async stop(): Promise<void> {
    if (this.stopPromise) {
      await this.stopPromise;
      return;
    }

    this.runToken += 1;
    this.isRunning = false;
    this.onDecodeCb = null;

    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }

    this.terminateWorker();

    const cleanupTask = (async () => {
      try {
        if (this.stream) {
          this.stream.getTracks().forEach((track) => {
            try {
              track.stop();
              track.enabled = false;
            } catch {
              // ignore
            }
          });
          this.stream = null;
        }
        this.activeTrack = null;

        if (this.videoEl) {
          this.videoEl.srcObject = null;
          this.videoEl.remove();
          this.videoEl = null;
        }

        if (this.containerId) {
          stopMediaStreamTracks(this.containerId);
        }
      } finally {
        this.isDecodingFrame = false;
      }
    })();

    this.stopPromise = cleanupTask;
    await cleanupTask;
    this.stopPromise = null;
  }
}
