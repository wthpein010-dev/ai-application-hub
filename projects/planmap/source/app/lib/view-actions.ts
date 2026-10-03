export interface ViewSize {
  width: number;
  height: number;
}

export interface CanvasViewTransform {
  scale: number;
  pan: { x: number; y: number };
}

export interface FullscreenTargetLike {
  requestFullscreen: () => Promise<unknown>;
}

export interface FullscreenDocumentLike {
  fullscreenElement: unknown;
  exitFullscreen: () => Promise<unknown>;
}

export interface SharePayload {
  title: string;
  text: string;
}

export interface ShareNavigatorLike {
  share?: (payload: SharePayload) => Promise<unknown>;
  clipboard?: { writeText: (text: string) => Promise<unknown> };
}

export interface MindMapCaptureOptions {
  backgroundColor: string;
  pixelRatio: number;
  cacheBust: boolean;
  skipFonts: boolean;
  width: number;
  height: number;
  style: { transform: string };
}

export type MindMapCapture = (element: HTMLElement, options: MindMapCaptureOptions) => Promise<string>;

export interface ExportRequest {
  id: number;
  type: "png" | "pdf";
}

export type ShareResult = "shared" | "copied" | "cancelled" | "unsupported";

const MIN_SCALE = 0.2;
const MAX_SCALE = 1.45;
const roundPosition = (value: number) => Math.round(value * 1000) / 1000;

export function calculateFitView(layout: ViewSize, viewport: ViewSize, padding = 40): CanvasViewTransform | null {
  if (layout.width <= 0 || layout.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return null;
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, availableWidth / layout.width, availableHeight / layout.height));
  return {
    scale,
    pan: {
      x: roundPosition((viewport.width - layout.width * scale) / 2),
      y: roundPosition((viewport.height - layout.height * scale) / 2),
    },
  };
}

export async function toggleFullscreen(target: FullscreenTargetLike, browserDocument: FullscreenDocumentLike): Promise<boolean> {
  if (browserDocument.fullscreenElement) {
    await browserDocument.exitFullscreen();
    return false;
  }
  await target.requestFullscreen();
  return true;
}

export async function shareMindMap(payload: SharePayload, browserNavigator: ShareNavigatorLike): Promise<ShareResult> {
  if (browserNavigator.share) {
    try {
      await browserNavigator.share(payload);
      return "shared";
    } catch (error) {
      if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") return "cancelled";
    }
  }
  if (browserNavigator.clipboard?.writeText) {
    await browserNavigator.clipboard.writeText(payload.text);
    return "copied";
  }
  return "unsupported";
}

export function captureMindMapImage(
  element: HTMLElement,
  layout: ViewSize,
  backgroundColor: string,
  capture: MindMapCapture,
): Promise<string> {
  return capture(element, {
    backgroundColor,
    pixelRatio: 1.5,
    cacheBust: true,
    skipFonts: true,
    width: layout.width,
    height: layout.height,
    style: { transform: "none" },
  });
}

export function shouldHandleExport(lastHandledId: number | null, signal: ExportRequest | null): signal is ExportRequest {
  return signal !== null && signal.id !== lastHandledId;
}

export function autoFitKey(document: { id: string; layout: string }): string {
  return `${document.id}:${document.layout}`;
}
