/**
 * Reine Geometrie-Hilfsfunktionen des 3D Explorers (ohne three.js, testbar).
 *
 * Konventionen entsprechen three.js: Y zeigt nach oben, Rotationen sind
 * Euler-Winkel in Radiant mit Reihenfolge "XYZ"; Zylinder, Kegel und Kapseln
 * sind entlang der lokalen Y-Achse ausgerichtet, der Torus liegt in der XY-Ebene.
 */
import type { Scene3D } from '@medtech/core';

export type Vec3 = [number, number, number];
export type ScenePart = Scene3D['parts'][number];

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

export interface OrbitState {
  /** Azimut um die Y-Achse (rad) */
  theta: number;
  /** Polarwinkel von der +Y-Achse (rad), 0 < phi < π */
  phi: number;
  /** Abstand Kamera–Ziel */
  radius: number;
}

export const ORBIT_LIMITS = { minPhi: 0.05, maxPhi: Math.PI - 0.05 };

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** Halbe Ausdehnung einer Form im lokalen Koordinatensystem (vor Rotation). */
export function localHalfExtents(part: Pick<ScenePart, 'shape' | 'size'>): Vec3 {
  const [a, b, c] = part.size.map((v) => Math.abs(v)) as Vec3;
  switch (part.shape) {
    case 'box':
      return [a / 2, b / 2, c / 2];
    case 'cylinder':
    case 'cone':
      return [a, b / 2, a];
    case 'sphere':
      return [a, a, a];
    case 'capsule':
      return [a, b / 2 + a, a];
    case 'torus':
      return [a + b, a + b, b];
  }
}

/** Rotationsmatrix (Zeilen) für Euler-Winkel in Reihenfolge XYZ (wie three.js). */
export function eulerXYZMatrix([x, y, z]: Vec3): [Vec3, Vec3, Vec3] {
  const a = Math.cos(x), b = Math.sin(x);
  const c = Math.cos(y), d = Math.sin(y);
  const e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [
    [c * e, -c * f, d],
    [af + be * d, ae - bf * d, -b * c],
    [bf - ae * d, be + af * d, a * c],
  ];
}

export function applyMatrix(m: [Vec3, Vec3, Vec3], v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Achsenparallele Hüllbox eines Teils (inkl. Rotation, optional verschoben). */
export function partBoundingBox(part: Pick<ScenePart, 'shape' | 'size' | 'position' | 'rotation'>, offset: Vec3 = [0, 0, 0]): Box3 {
  const h = localHalfExtents(part);
  const center = add(part.position, offset);
  const m = eulerXYZMatrix(part.rotation ?? [0, 0, 0]);
  // Halbe Ausdehnung der rotierten Box = |M| · h
  const ext: Vec3 = [0, 1, 2].map((i) => Math.abs(m[i]![0]) * h[0] + Math.abs(m[i]![1]) * h[1] + Math.abs(m[i]![2]) * h[2]) as Vec3;
  return { min: sub(center, ext), max: add(center, ext) };
}

/** Hüllbox aller Teile; Offsets (z. B. Explosionsansicht) optional je Teil-ID. */
export function sceneBoundingBox(parts: ScenePart[], offsets?: Record<string, Vec3>): Box3 {
  if (!parts.length) return { min: [-1, -1, -1], max: [1, 1, 1] };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const b = partBoundingBox(p, offsets?.[p.id]);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, b.min[i]!);
      max[i] = Math.max(max[i]!, b.max[i]!);
    }
  }
  return { min, max };
}

export function boxCenter(b: Box3): Vec3 {
  return scale(add(b.min, b.max), 0.5);
}

export function boxSize(b: Box3): Vec3 {
  return sub(b.max, b.min);
}

/** Radius der Hüllkugel einer Box */
export function boxRadius(b: Box3): number {
  return length(boxSize(b)) / 2;
}

/** Schwerpunkt (Mittelwert) der Teilepositionen */
export function centroid(parts: Pick<ScenePart, 'position'>[]): Vec3 {
  if (!parts.length) return [0, 0, 0];
  const s = parts.reduce<Vec3>((acc, p) => add(acc, p.position), [0, 0, 0]);
  return scale(s, 1 / parts.length);
}

/**
 * Verschiebungen für die Explosionsansicht: Jedes Teil bewegt sich vom
 * Schwerpunkt weg, proportional zu seinem Abstand (`factor`) plus einem
 * Mindestabstand (`minStep`, relativ zur Szenengröße), damit eng
 * beieinanderliegende Teile sichtbar auseinanderrücken.
 * Teile exakt im Schwerpunkt bleiben stehen.
 */
export function explodeOffsets(parts: ScenePart[], factor = 0.6, minStep = 0.15): Record<string, Vec3> {
  const c = centroid(parts);
  const r = boxRadius(sceneBoundingBox(parts));
  const out: Record<string, Vec3> = {};
  for (const p of parts) {
    const d = sub(p.position, c);
    const len = length(d);
    if (len < 1e-9) {
      out[p.id] = [0, 0, 0];
      continue;
    }
    const dir = scale(d, 1 / len);
    out[p.id] = scale(dir, len * factor + r * minStep);
  }
  return out;
}

/** Interpoliert Offsets (0 = zusammengebaut, 1 = vollständig explodiert). */
export function lerpOffsets(offsets: Record<string, Vec3>, t: number): Record<string, Vec3> {
  const k = Math.min(1, Math.max(0, t));
  return Object.fromEntries(Object.entries(offsets).map(([id, v]) => [id, scale(v, k)]));
}

/** Kameraabstand, damit eine Hüllkugel mit Radius r bei gegebenem vertikalem FOV (Grad) und Seitenverhältnis vollständig sichtbar ist. */
export function fitDistance(radius: number, fovDeg: number, aspect = 1, margin = 1.15): number {
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 1e-3));
  const fov = Math.min(vFov, hFov);
  return (Math.max(radius, 1e-3) * margin) / Math.sin(fov / 2);
}

/** Polarkoordinaten → Kartesisch (relativ zum Ziel) */
export function orbitToPosition(o: OrbitState, target: Vec3 = [0, 0, 0]): Vec3 {
  const s = Math.sin(o.phi);
  return [target[0] + o.radius * s * Math.sin(o.theta), target[1] + o.radius * Math.cos(o.phi), target[2] + o.radius * s * Math.cos(o.theta)];
}

/** Kartesisch → Polarkoordinaten (relativ zum Ziel) */
export function positionToOrbit(pos: Vec3, target: Vec3 = [0, 0, 0]): OrbitState {
  const d = sub(pos, target);
  const radius = length(d) || 1;
  return {
    radius,
    theta: Math.atan2(d[0], d[2]),
    phi: Math.acos(Math.min(1, Math.max(-1, d[1] / radius))),
  };
}

export function clampOrbit(o: OrbitState, minRadius: number, maxRadius: number): OrbitState {
  return {
    theta: o.theta,
    phi: Math.min(ORBIT_LIMITS.maxPhi, Math.max(ORBIT_LIMITS.minPhi, o.phi)),
    radius: Math.min(maxRadius, Math.max(minRadius, o.radius)),
  };
}

export interface CameraSetup {
  target: Vec3;
  orbit: OrbitState;
  minRadius: number;
  maxRadius: number;
}

/**
 * Startkamera einer Szene: Ziel = Mitte der Hüllbox; Position aus
 * `scene.camera` (falls angegeben), sonst schräg von vorne oben mit
 * passendem Abstand.
 */
export function initialCamera(scene: Scene3D, fovDeg: number, aspect: number): CameraSetup {
  const box = sceneBoundingBox(scene.parts);
  const target = boxCenter(box);
  const radius = boxRadius(box);
  const fit = fitDistance(radius, fovDeg, aspect);
  // Richtung aus scene.camera, Abstand aber mindestens so groß, dass das ganze Modell sichtbar ist
  const orbit = scene.camera ? { ...positionToOrbit(scene.camera, target), radius: Math.max(fit, length(sub(scene.camera, target))) } : { theta: Math.PI / 6, phi: Math.PI / 2.6, radius: fit };
  const minRadius = Math.max(radius * 0.3, 0.05);
  const maxRadius = Math.max(fit * 4, orbit.radius * 2);
  return { target, orbit: clampOrbit(orbit, minRadius, maxRadius), minRadius, maxRadius };
}

/** Verhältnis der Szenengröße explodiert/zusammengebaut (für automatisches Herauszoomen) */
export function explodeZoomFactor(parts: ScenePart[], offsets: Record<string, Vec3>): number {
  const normal = boxRadius(sceneBoundingBox(parts));
  const exploded = boxRadius(sceneBoundingBox(parts, offsets));
  return normal > 0 ? Math.max(1, exploded / normal) : 1;
}

/** Zählt verschiedene verknüpfte Komponenten in einer Szene */
export function linkedComponents(scene: Scene3D): string[] {
  return [...new Set(scene.parts.map((p) => p.component).filter((c): c is string => !!c))];
}

/** Liest eine Szene typsicher aus beliebigen Entitätsdaten */
export function sceneOf(data: unknown): Scene3D | null {
  if (!data || typeof data !== 'object') return null;
  const s = (data as { scene?: unknown }).scene as Scene3D | undefined;
  if (!s || !Array.isArray(s.parts) || s.parts.length === 0) return null;
  return s;
}
