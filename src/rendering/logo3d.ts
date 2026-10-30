import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface LogoOptions {
  depth: number;
  bevel: number;
  faceColor: string;
  faceMetalness: number;
  faceRoughness: number;
  sideColor: string;
  sideMetalness: number;
  sideRoughness: number;
  sideTextureScale: number;
  motion: "intro" | "loop";
  duration: number;
  turns: number;
  tilt: number;
  background: string | null;
}

export const DEFAULT_LOGO_OPTIONS: LogoOptions = {
  depth: 0.08, bevel: 0.006,
  faceColor: "#f0e7ce", faceMetalness: 0.2, faceRoughness: 0.35,
  sideColor: "#d9a361", sideMetalness: 0.9, sideRoughness: 0.3, sideTextureScale: 1,
  motion: "intro", duration: 4, turns: 2, tilt: 8,
  background: null,
};

export type LogoSurface = "face" | "side";
export interface SvgReport { shapes: number; skipped: number }
export interface ExportSettings { width: number; height: number; fps: number }

const LOGO_WIDTH = 4;
const FIT = 0.62;
const INTRO_HOLD = 1;

// Caps get UVs normalized to the logo's bounding box so a texture spans the whole face once.
// Side walls (including bevels) use square texels where one tile spans the full edge thickness.
function logoUVGenerator(minX: number, minY: number, width: number, height: number, bevel: number, thickness: number): THREE.UVGenerator {
  const top = (v: number[], i: number) => new THREE.Vector2((v[i * 3] - minX) / width, 1 - (v[i * 3 + 1] - minY) / height);
  const side = (v: number[], i: number, useX: boolean) => new THREE.Vector2((useX ? v[i * 3] : v[i * 3 + 1]) / thickness, (v[i * 3 + 2] + bevel) / thickness);
  return {
    generateTopUV: (_geometry, v, a, b, c) => [top(v, a), top(v, b), top(v, c)],
    generateSideWallUV: (_geometry, v, a, b, c, d) => {
      const useX = Math.abs(v[a * 3 + 1] - v[b * 3 + 1]) < Math.abs(v[a * 3] - v[b * 3]);
      return [side(v, a, useX), side(v, b, useX), side(v, c, useX), side(v, d, useX)];
    },
  };
}

export class LogoScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
  private pivot = new THREE.Group();
  private faceMaterial = new THREE.MeshStandardMaterial();
  private sideMaterial = new THREE.MeshStandardMaterial();
  private mesh: THREE.Mesh | null = null;
  private environment: THREE.Texture;
  private options = DEFAULT_LOGO_OPTIONS;
  private svg: string | null = null;
  private logoHeight = LOGO_WIDTH;
  private frame = 0;
  private startedAt = performance.now();
  private exporting = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.environment;
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 4, 6);
    this.scene.add(key, this.pivot);
    this.applyMaterials();
    this.frame = requestAnimationFrame(this.tick);
  }

  setSvg(svg: string): SvgReport {
    this.svg = svg;
    return this.buildGeometry();
  }

  setOptions(options: LogoOptions) {
    const rebuild = options.depth !== this.options.depth || options.bevel !== this.options.bevel;
    this.options = options;
    this.applyMaterials();
    if (rebuild && this.svg) this.buildGeometry();
  }

  setTexture(surface: LogoSurface, texture: THREE.Texture | null) {
    const material = surface === "face" ? this.faceMaterial : this.sideMaterial;
    material.map?.dispose();
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      if (surface === "side") texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }
    material.map = texture;
    material.needsUpdate = true;
    this.applyMaterials();
  }

  resize(width: number, height: number) {
    if (this.exporting) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.fitCamera(width / height);
  }

  // Exports one PNG per frame with alpha; time is stepped exactly so no frames drop.
  async exportFrames(directory: FileSystemDirectoryHandle, settings: ExportSettings, onProgress: (done: number, total: number) => void) {
    const size = this.renderer.getSize(new THREE.Vector2());
    const pixelRatio = this.renderer.getPixelRatio();
    const loopFrames = Math.round(this.options.duration * settings.fps);
    const total = this.options.motion === "loop" ? loopFrames : loopFrames + 1;
    this.exporting = true;
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(settings.width, settings.height, false);
      this.fitCamera(settings.width / settings.height);
      for (let index = 0; index < total; index++) {
        this.renderAt(index / settings.fps);
        const blob = await new Promise<Blob | null>(resolve => this.canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error(`Frame ${index} could not be encoded.`);
        const file = await directory.getFileHandle(`pvr_logo_${String(index).padStart(4, "0")}.png`, { create: true });
        const writable = await file.createWritable();
        await writable.write(blob);
        await writable.close();
        onProgress(index + 1, total);
      }
    } finally {
      this.exporting = false;
      this.renderer.setPixelRatio(pixelRatio);
      this.renderer.setSize(size.x, size.y, false);
      this.fitCamera(size.x / size.y);
      this.startedAt = performance.now();
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.mesh?.geometry.dispose();
    this.faceMaterial.map?.dispose();
    this.sideMaterial.map?.dispose();
    this.faceMaterial.dispose();
    this.sideMaterial.dispose();
    this.environment.dispose();
    this.renderer.dispose();
  }

  private tick = (now: number) => {
    this.frame = requestAnimationFrame(this.tick);
    if (this.exporting) return;
    const cycle = this.options.duration + (this.options.motion === "intro" ? INTRO_HOLD : 0);
    this.renderAt(((now - this.startedAt) / 1000) % cycle);
  };

  private renderAt(seconds: number) {
    const { motion, duration, turns, tilt } = this.options;
    const progress = Math.min(seconds / duration, 1);
    const spin = motion === "loop" ? progress : 1 - Math.pow(1 - progress, 3);
    // Intro ends facing the camera; loop starts there and wraps seamlessly with whole turns.
    const angle = Math.PI * 2 * turns * (motion === "loop" ? spin : spin - 1);
    this.pivot.rotation.set(THREE.MathUtils.degToRad(tilt), angle, 0);
    this.renderer.render(this.scene, this.camera);
  }

  private applyMaterials() {
    const { faceColor, faceMetalness, faceRoughness, sideColor, sideMetalness, sideRoughness, sideTextureScale, background } = this.options;
    this.faceMaterial.color.set(faceColor);
    this.faceMaterial.metalness = faceMetalness;
    this.faceMaterial.roughness = faceRoughness;
    this.sideMaterial.color.set(sideColor);
    this.sideMaterial.metalness = sideMetalness;
    this.sideMaterial.roughness = sideRoughness;
    this.sideMaterial.map?.repeat.set(sideTextureScale, sideTextureScale);
    this.scene.background = background ? new THREE.Color(background) : null;
  }

  private buildGeometry(): SvgReport {
    if (this.mesh) { this.pivot.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    const data = new SVGLoader().parse(this.svg ?? "");
    let skipped = 0;
    const shapes = data.paths.flatMap(path => {
      if (path.userData?.style.fill === "none") { skipped++; return []; }
      return SVGLoader.createShapes(path);
    });
    if (!shapes.length) return { shapes: 0, skipped };

    const box = new THREE.Box2();
    for (const shape of shapes) for (const point of shape.getPoints()) box.expandByPoint(point);
    const width = box.max.x - box.min.x, height = box.max.y - box.min.y;
    const depth = this.options.depth * width;
    const bevel = this.options.bevel * width;
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth,
      curveSegments: 24,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      UVGenerator: logoUVGenerator(box.min.x, box.min.y, width, height, bevel, depth + bevel * 2),
    });
    geometry.translate(-(box.min.x + width / 2), -(box.min.y + height / 2), -depth / 2);
    this.mesh = new THREE.Mesh(geometry, [this.faceMaterial, this.sideMaterial]);
    // SVG y points down; the negative scale flips it upright and three.js corrects the winding.
    const scale = LOGO_WIDTH / width;
    this.mesh.scale.set(scale, -scale, scale);
    this.pivot.add(this.mesh);
    this.logoHeight = height * scale;
    this.fitCamera(this.camera.aspect);
    return { shapes: shapes.length, skipped };
  }

  private fitCamera(aspect: number) {
    this.camera.aspect = aspect;
    const visibleHeight = Math.max(this.logoHeight, LOGO_WIDTH / aspect) / FIT;
    this.camera.position.set(0, 0, visibleHeight / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.camera.updateProjectionMatrix();
  }
}
