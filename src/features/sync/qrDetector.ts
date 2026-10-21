/**
 * 识别相机画面中的二维码（F-073）：优先使用浏览器内置的 BarcodeDetector（Chrome、Edge、
 * Android 等，由系统加速）；不支持时按需加载 jsQR（纯 JavaScript，只在第一次扫码时下载）。
 */

interface DetectedBarcode {
  readonly rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options: { readonly formats: readonly string[] }): BarcodeDetectorInstance;
  getSupportedFormats(): Promise<string[]>;
}

declare global {
  interface Window {
    /** 形状检测 API（尚未进入 TypeScript 的 DOM 类型）；部分浏览器没有 */
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

/** 识别一帧画面；没有二维码时返回 null */
export type QrDetector = (video: HTMLVideoElement) => Promise<string | null>;

const QR_FORMAT = 'qr_code';
/** jsQR 处理大图很慢：先把画面缩小到这个边长以内（像素），配对码的二维码仍然足够清晰 */
const MAX_SCAN_SIDE = 640;

async function nativeDetector(): Promise<QrDetector | null> {
  const Detector = window.BarcodeDetector;
  if (Detector === undefined) return null;
  try {
    const formats = await Detector.getSupportedFormats();
    if (!formats.includes(QR_FORMAT)) return null;
  } catch {
    return null;
  }
  const detector = new Detector({ formats: [QR_FORMAT] });
  return async (video) => {
    const [first] = await detector.detect(video);
    return first?.rawValue ?? null;
  };
}

async function scriptDetector(): Promise<QrDetector> {
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return (video) => {
    const { videoWidth, videoHeight } = video;
    if (context === null || videoWidth === 0 || videoHeight === 0) return Promise.resolve(null);
    const scale = Math.min(1, MAX_SCAN_SIDE / Math.max(videoWidth, videoHeight));
    const width = Math.round(videoWidth * scale);
    const height = Math.round(videoHeight * scale);
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    const code = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });
    return Promise.resolve(code?.data ?? null);
  };
}

export async function createQrDetector(): Promise<QrDetector> {
  return (await nativeDetector()) ?? scriptDetector();
}

/** 能否使用相机（非安全上下文或不支持的浏览器中没有 mediaDevices） */
export function canUseCamera(): boolean {
  return 'mediaDevices' in navigator && typeof navigator.mediaDevices.getUserMedia === 'function';
}
