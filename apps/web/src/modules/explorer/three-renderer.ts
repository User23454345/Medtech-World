/**
 * Imperativer three.js-Renderer des 3D Explorers.
 * Wird ausschließlich per dynamic import() geladen, damit three.js nur dann
 * in den Browser kommt, wenn tatsächlich eine 3D-Ansicht angezeigt wird.
 */
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Scene3D } from '@medtech/core';
import { clampOrbit, explodeOffsets, explodeZoomFactor, initialCamera, lerpOffsets, orbitToPosition, type OrbitState, type ScenePart, type Vec3 } from './scene-math.ts';

export interface RendererCallbacks {
  onHover?: (partId: string | null) => void;
  onSelect?: (partId: string | null) => void;
}

export interface RendererOptions {
  reducedMotion: boolean;
  dark: boolean;
  /** Mausrad zoomt nur bei fokussierter Ansicht oder mit Strg (verhindert Scroll-Kapern in eingebetteten Ansichten) */
  wheelRequiresFocus?: boolean;
}

const FOV = 40;
const HOVER_EMISSIVE = new Color('#3a4a5c');
const SELECT_EMISSIVE = new Color('#1e6fd9');
const EXPLODE_MS = 450;
const TRANSPARENT_OPACITY = 0.28;

interface PartObject {
  part: ScenePart;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  base: Vec3;
  edges?: LineSegments<EdgesGeometry, LineBasicMaterial>;
}

function geometryFor(p: ScenePart): BufferGeometry {
  const [a, b, c] = p.size.map((v) => Math.max(Math.abs(v), 0.001)) as Vec3;
  switch (p.shape) {
    case 'box':
      return new BoxGeometry(a, b, c);
    case 'cylinder':
      return new CylinderGeometry(a, a, b, 32);
    case 'cone':
      return new ConeGeometry(a, b, 32);
    case 'sphere':
      return new SphereGeometry(a, 32, 20);
    case 'capsule':
      return new CapsuleGeometry(a, b, 8, 24);
    case 'torus':
      return new TorusGeometry(a, b, 16, 48);
  }
}

/** Prüft, ob WebGL grundsätzlich verfügbar ist */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class SceneRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.01, 1000);
  private parts: PartObject[] = [];
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private target: Vec3;
  private orbit: OrbitState;
  private home: { orbit: OrbitState; target: Vec3 };
  private minRadius: number;
  private maxRadius: number;
  private offsets: Record<string, Vec3>;
  private explodeZoom = 1;
  private explodeT = 0;
  private explodeGoal = 0;
  private transparent = false;
  private hovered: string | null = null;
  private selected: string | null = null;
  private frame = 0;
  private animStart = 0;
  private animFrom = 0;
  private disposed = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragDistance = 0;
  private pinchDistance = 0;
  private resizeObserver: ResizeObserver;
  private listeners: Array<() => void> = [];

  constructor(
    private container: HTMLElement,
    private data: Scene3D,
    private callbacks: RendererCallbacks,
    private options: RendererOptions,
  ) {
    // Wirft, wenn kein WebGL-Kontext erzeugt werden kann → Fallback im Aufrufer
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'mw-explorer-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(this.canvas);

    this.buildLights();
    this.buildParts();
    this.offsets = explodeOffsets(data.parts);
    this.explodeZoom = explodeZoomFactor(data.parts, this.offsets);

    const rect = container.getBoundingClientRect();
    const aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1.5;
    const cam = initialCamera(data, FOV, aspect);
    this.target = cam.target;
    this.orbit = cam.orbit;
    this.minRadius = cam.minRadius;
    this.maxRadius = cam.maxRadius;
    this.home = { orbit: { ...cam.orbit }, target: [...cam.target] };

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.attachPointer();
    this.resize();
  }

  // ---------------------------------------------------------------- Aufbau
  private buildLights() {
    this.scene.add(new HemisphereLight(0xffffff, this.options.dark ? 0x1b2533 : 0xb8c4d0, this.options.dark ? 1.1 : 1.3));
    this.scene.add(new AmbientLight(0xffffff, 0.25));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.5);
    fill.position.set(-5, 2, -4);
    this.scene.add(fill);
  }

  private buildParts() {
    for (const part of this.data.parts) {
      const opacity = part.opacity ?? 1;
      const material = new MeshStandardMaterial({
        color: new Color(part.color),
        roughness: 0.55,
        metalness: 0.08,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      });
      const mesh = new Mesh(geometryFor(part), material);
      mesh.position.set(...part.position);
      if (part.rotation) mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2], 'XYZ');
      mesh.userData.partId = part.id;
      this.scene.add(mesh);
      this.parts.push({ part, mesh, base: [...part.position] });
    }
  }

  // ---------------------------------------------------------------- Öffentliche API
  setSelected(id: string | null) {
    if (this.selected === id) return;
    this.selected = id;
    this.updateMaterials();
    this.requestRender();
  }

  setHovered(id: string | null) {
    if (this.hovered === id) return;
    this.hovered = id;
    this.updateMaterials();
    this.requestRender();
  }

  setExploded(on: boolean) {
    this.explodeGoal = on ? 1 : 0;
    if (this.options.reducedMotion) {
      this.explodeT = this.explodeGoal;
      this.applyOffsets();
      this.requestRender();
      return;
    }
    this.animFrom = this.explodeT;
    this.animStart = performance.now();
    this.requestRender();
  }

  setTransparent(on: boolean) {
    this.transparent = on;
    this.updateMaterials();
    this.requestRender();
  }

  setReducedMotion(on: boolean) {
    this.options.reducedMotion = on;
  }

  resetView() {
    this.orbit = { ...this.home.orbit };
    this.target = [...this.home.target];
    this.requestRender();
  }

  /** Drehen in Radiant (Tastatur/Buttons) */
  rotateBy(dTheta: number, dPhi: number) {
    this.orbit = clampOrbit({ ...this.orbit, theta: this.orbit.theta + dTheta, phi: this.orbit.phi + dPhi }, this.minRadius, this.maxRadius);
    this.requestRender();
  }

  /** factor < 1 = näher heran */
  zoomBy(factor: number) {
    this.orbit = clampOrbit({ ...this.orbit, radius: this.orbit.radius * factor }, this.minRadius, this.maxRadius);
    this.requestRender();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    for (const off of this.listeners) off();
    for (const p of this.parts) {
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      this.disposeEdges(p);
    }
    this.parts = [];
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ---------------------------------------------------------------- Darstellung
  private updateMaterials() {
    for (const p of this.parts) {
      const m = p.mesh.material;
      const isSel = p.part.id === this.selected;
      const isHover = p.part.id === this.hovered;
      m.emissive.copy(isSel ? SELECT_EMISSIVE : isHover ? HOVER_EMISSIVE : new Color(0x000000));
      m.emissiveIntensity = isSel ? 0.55 : isHover ? 0.6 : 0;
      const baseOpacity = p.part.opacity ?? 1;
      const opacity = this.transparent && !isSel ? Math.min(baseOpacity, TRANSPARENT_OPACITY) : baseOpacity;
      m.opacity = opacity;
      m.transparent = opacity < 1;
      m.depthWrite = opacity >= 1;
      m.needsUpdate = true;
      if (isSel && !p.edges) {
        const edges = new LineSegments(new EdgesGeometry(p.mesh.geometry, 25), new LineBasicMaterial({ color: SELECT_EMISSIVE }));
        p.mesh.add(edges);
        p.edges = edges;
      } else if (!isSel && p.edges) {
        this.disposeEdges(p);
      }
    }
  }

  private disposeEdges(p: PartObject) {
    if (!p.edges) return;
    p.mesh.remove(p.edges);
    p.edges.geometry.dispose();
    p.edges.material.dispose();
    p.edges = undefined;
  }

  private applyOffsets() {
    const off = lerpOffsets(this.offsets, this.explodeT);
    for (const p of this.parts) {
      const o = off[p.part.id] ?? [0, 0, 0];
      p.mesh.position.set(p.base[0] + o[0], p.base[1] + o[1], p.base[2] + o[2]);
    }
  }

  private requestRender() {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderFrame();
    });
  }

  private renderFrame() {
    if (this.disposed) return;
    let animating = false;
    if (this.explodeT !== this.explodeGoal) {
      const k = Math.min(1, (performance.now() - this.animStart) / EXPLODE_MS);
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.explodeT = this.animFrom + (this.explodeGoal - this.animFrom) * ease;
      if (k >= 1) this.explodeT = this.explodeGoal;
      else animating = true;
      this.applyOffsets();
    }
    // Während/nach der Explosion automatisch so weit herauszoomen, dass alle Teile sichtbar bleiben
    const radius = this.orbit.radius * (1 + (this.explodeZoom - 1) * this.explodeT);
    const pos = orbitToPosition({ ...this.orbit, radius }, this.target);
    this.camera.position.set(...pos);
    this.camera.lookAt(new Vector3(...this.target));
    this.renderer.render(this.scene, this.camera);
    if (animating) this.requestRender();
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  // ---------------------------------------------------------------- Eingabe
  private on<K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) {
    this.canvas.addEventListener(type, fn as EventListener, opts);
    this.listeners.push(() => this.canvas.removeEventListener(type, fn as EventListener, opts));
  }

  private pick(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.parts.map((p) => p.mesh),
      false,
    );
    // Im Transparenzmodus durchsichtige Hüllen überspringen, wenn dahinter etwas liegt
    const hit = this.transparent ? (hits.find((h) => (h.object as Mesh<BufferGeometry, MeshStandardMaterial>).material.opacity > TRANSPARENT_OPACITY) ?? hits[0]) : hits[0];
    return (hit?.object.userData.partId as string | undefined) ?? null;
  }

  private attachPointer() {
    this.canvas.style.touchAction = 'none';
    this.on('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragDistance = 0;
      if (this.pointers.size === 2) this.pinchDistance = this.currentPinch();
    });
    this.on('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') {
          const id = this.pick(e.clientX, e.clientY);
          if (id !== this.hovered) {
            this.setHovered(id);
            this.callbacks.onHover?.(id);
          }
          this.canvas.style.cursor = id ? 'pointer' : 'grab';
        }
        return;
      }
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragDistance += Math.abs(dx) + Math.abs(dy);
      if (this.pointers.size >= 2) {
        const d = this.currentPinch();
        if (this.pinchDistance > 0 && d > 0) this.zoomBy(this.pinchDistance / d);
        this.pinchDistance = d;
        return;
      }
      this.canvas.style.cursor = 'grabbing';
      const rect = this.canvas.getBoundingClientRect();
      const speed = (2 * Math.PI) / Math.max(rect.width, 200);
      this.rotateBy(-dx * speed, -dy * speed);
    });
    const end = (e: PointerEvent) => {
      const wasSingle = this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDistance = 0;
      if (e.type === 'pointerup' && wasSingle && this.dragDistance < 5) {
        const id = this.pick(e.clientX, e.clientY);
        this.callbacks.onSelect?.(id);
      }
      this.canvas.style.cursor = 'grab';
    };
    this.on('pointerup', end);
    this.on('pointercancel', end);
    this.on('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.pointers.size && this.hovered) {
        this.setHovered(null);
        this.callbacks.onHover?.(null);
      }
    });
    this.on(
      'wheel',
      (e) => {
        if (this.options.wheelRequiresFocus && !e.ctrlKey && !this.container.parentElement?.contains(document.activeElement)) return;
        e.preventDefault();
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        this.zoomBy(Math.exp(Math.max(-1, Math.min(1, delta / 400))));
      },
      { passive: false },
    );
  }

  private currentPinch(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
  }
}
