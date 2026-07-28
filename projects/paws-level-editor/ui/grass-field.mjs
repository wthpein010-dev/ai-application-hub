import { GAMEPLAY_ASSETS } from "../core/gameplay-assets.mjs";
import {
  GRASS_PATCHES,
  GRASS_ROTATION_RADIANS,
  GRASS_VISUAL_SCALE,
  drawGrassAtlasPatch,
  grassPulseScale,
} from "../core/grass-layout.mjs";

const SPINE_STAGE_WIDTH = 640;

export class GrassField {
  constructor({
    assetUrl = GAMEPLAY_ASSETS.grass,
    imageFactory = () => new Image(),
    motionQuery = matchMedia("(prefers-reduced-motion: reduce)"),
    requestFrame = (callback) => requestAnimationFrame(callback),
    cancelFrame = (frame) => cancelAnimationFrame(frame),
  } = {}) {
    this.assetUrl = assetUrl;
    this.imageFactory = imageFactory;
    this.motionQuery = motionQuery;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.animationFrame = null;
    this.destroyed = false;
    this.imageReady = false;
  }

  mount(host) {
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "level-grass-field";
    this.canvas.setAttribute("aria-hidden", "true");
    this.context = this.canvas.getContext("2d");
    host.prepend(this.canvas);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.onVisibilityChange = () => this.syncAnimation();
    this.onMotionChange = () => this.syncAnimation();
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.motionQuery.addEventListener?.("change", this.onMotionChange);

    this.image = this.imageFactory();
    this.image.decoding = "async";
    this.image.onload = async () => {
      try {
        await this.image.decode?.();
      } catch {
        // A loaded image can still be drawn when decode() is unavailable or rejects.
      }
      if (this.destroyed) return;
      this.imageReady = true;
      this.syncAnimation();
    };
    this.image.onerror = () => {
      this.imageReady = false;
      this.stopAnimation();
      this.clear();
    };
    this.image.src = this.assetUrl;
    this.resize();
    return this;
  }

  resize() {
    if (!this.canvas || !this.host || !this.context) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = width;
    this.height = height;
    this.draw(performance.now() / 1000);
  }

  isReducedMotion() {
    return this.motionQuery.matches || document.visibilityState !== "visible";
  }

  clear() {
    if (!this.context || !this.width || !this.height) return;
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.restore();
  }

  draw(seconds) {
    this.clear();
    if (!this.imageReady || !this.context || !this.width || !this.height) return;
    const scale = Math.min(this.width, this.height * 0.8)
      / SPINE_STAGE_WIDTH
      * GRASS_VISUAL_SCALE;
    const pulse = grassPulseScale(seconds, { reducedMotion: this.isReducedMotion() });
    this.lastPulseScale = pulse;
    this.context.imageSmoothingEnabled = true;
    for (const patch of GRASS_PATCHES) {
      const centerX = patch.normalizedX * this.width;
      const baseY = patch.normalizedY * this.height;
      drawGrassAtlasPatch(this.context, this.image, patch.variant, {
        centerX,
        baseY,
        pixelScale: scale,
        scaleY: pulse,
        alpha: 0.94,
        rotationRadians: GRASS_ROTATION_RADIANS + patch.rotationRadians,
      });
    }
  }

  stopAnimation() {
    if (this.animationFrame !== null) {
      this.cancelFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  syncAnimation() {
    this.stopAnimation();
    if (this.destroyed || !this.imageReady) return;
    this.draw(performance.now() / 1000);
    if (this.isReducedMotion()) return;
    const tick = (timestamp) => {
      if (this.destroyed || this.isReducedMotion()) {
        this.animationFrame = null;
        this.draw(timestamp / 1000);
        return;
      }
      this.draw(timestamp / 1000);
      this.animationFrame = this.requestFrame(tick);
    };
    this.animationFrame = this.requestFrame(tick);
  }

  destroy() {
    this.destroyed = true;
    this.stopAnimation();
    this.resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.motionQuery.removeEventListener?.("change", this.onMotionChange);
    this.canvas?.remove();
    this.image = null;
  }
}
