import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Vector3 } from 'three';
import type { RelationGroup, Scene3D } from '@medtech/core';
import {
  applyMatrix,
  boxCenter,
  centroid,
  clampOrbit,
  eulerXYZMatrix,
  explodeOffsets,
  explodeZoomFactor,
  fitDistance,
  initialCamera,
  lerpOffsets,
  linkedComponents,
  localHalfExtents,
  orbitToPosition,
  partBoundingBox,
  positionToOrbit,
  sceneBoundingBox,
  sceneOf,
  type ScenePart,
  type Vec3,
} from './scene-math.ts';
import { componentFacts, plural } from './relations.ts';

const part = (id: string, position: Vec3, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  label: id,
  shape: 'box',
  size: [1, 1, 1],
  position,
  color: '#ffffff',
  ...extra,
});

describe('localHalfExtents', () => {
  it('berücksichtigt die Formkonventionen', () => {
    expect(localHalfExtents({ shape: 'box', size: [2, 4, 6] })).toEqual([1, 2, 3]);
    expect(localHalfExtents({ shape: 'cylinder', size: [0.5, 2, 0] })).toEqual([0.5, 1, 0.5]);
    expect(localHalfExtents({ shape: 'sphere', size: [0.3, 0, 0] })).toEqual([0.3, 0.3, 0.3]);
    expect(localHalfExtents({ shape: 'capsule', size: [0.2, 1, 0] })).toEqual([0.2, 0.7, 0.2]);
    expect(localHalfExtents({ shape: 'torus', size: [1, 0.2, 0] })).toEqual([1.2, 1.2, 0.2]);
  });
});

describe('eulerXYZMatrix', () => {
  it('entspricht der three.js-Rotation (Reihenfolge XYZ)', () => {
    const angles: Vec3 = [0.3, -1.1, 2.0];
    const m = eulerXYZMatrix(angles);
    const v: Vec3 = [1, 2, 3];
    const ours = applyMatrix(m, v);
    const ref = new Vector3(...v).applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...angles, 'XYZ')));
    expect(ours[0]).toBeCloseTo(ref.x, 10);
    expect(ours[1]).toBeCloseTo(ref.y, 10);
    expect(ours[2]).toBeCloseTo(ref.z, 10);
  });
});

describe('Hüllboxen', () => {
  it('berechnet die Box eines verschobenen Würfels', () => {
    const b = partBoundingBox(part('a', [1, 2, 3]));
    expect(b.min).toEqual([0.5, 1.5, 2.5]);
    expect(b.max).toEqual([1.5, 2.5, 3.5]);
  });

  it('berücksichtigt Rotation (Zylinder um 90° um Z liegt waagerecht)', () => {
    const b = partBoundingBox({ shape: 'cylinder', size: [0.1, 2, 0], position: [0, 0, 0], rotation: [0, 0, Math.PI / 2] });
    expect(b.max[0]).toBeCloseTo(1, 10);
    expect(b.max[1]).toBeCloseTo(0.1, 10);
  });

  it('vereinigt alle Teile und Offsets', () => {
    const parts = [part('a', [0, 0, 0]), part('b', [4, 0, 0])];
    const box = sceneBoundingBox(parts);
    expect(box.min).toEqual([-0.5, -0.5, -0.5]);
    expect(box.max).toEqual([4.5, 0.5, 0.5]);
    expect(boxCenter(box)).toEqual([2, 0, 0]);
    expect(sceneBoundingBox(parts, { b: [0, 2, 0] }).max[1]).toBe(2.5);
  });

  it('liefert für leere Szenen eine Standardbox', () => {
    expect(sceneBoundingBox([])).toEqual({ min: [-1, -1, -1], max: [1, 1, 1] });
  });
});

describe('Explosionsansicht', () => {
  const parts = [part('links', [-1, 0, 0]), part('rechts', [1, 0, 0]), part('mitte', [0, 0, 0])];

  it('berechnet den Schwerpunkt', () => {
    expect(centroid(parts)).toEqual([0, 0, 0]);
    expect(centroid([])).toEqual([0, 0, 0]);
  });

  it('bewegt Teile vom Schwerpunkt weg, das Zentrum bleibt stehen', () => {
    const o = explodeOffsets(parts, 0.5, 0);
    expect(o.links).toEqual([-0.5, 0, 0]);
    expect(o.rechts).toEqual([0.5, 0, 0]);
    expect(o.mitte).toEqual([0, 0, 0]);
  });

  it('ergänzt einen Mindestabstand relativ zur Szenengröße', () => {
    const o = explodeOffsets(parts, 0, 0.1);
    expect(o.rechts![0]).toBeGreaterThan(0);
    expect(o.links![0]).toBeLessThan(0);
  });

  it('zoomt für die Explosionsansicht passend heraus', () => {
    const o = explodeOffsets(parts, 0.5, 0);
    expect(explodeZoomFactor(parts, o)).toBeCloseTo(Math.sqrt(18 / 11), 10);
    expect(explodeZoomFactor(parts, {})).toBe(1);
  });

  it('interpoliert und begrenzt den Fortschritt', () => {
    const o = { a: [2, 0, -2] as Vec3 };
    expect(lerpOffsets(o, 0.5).a).toEqual([1, 0, -1]);
    expect(lerpOffsets(o, 2).a).toEqual([2, 0, -2]);
    expect(lerpOffsets(o, -1).a).toEqual([0, 0, -0]);
  });
});

describe('Kamera', () => {
  it('fitDistance wächst mit dem Radius und bei schmalem Bild', () => {
    const d1 = fitDistance(1, 40, 1.5);
    expect(fitDistance(2, 40, 1.5)).toBeCloseTo(d1 * 2, 10);
    expect(fitDistance(1, 40, 0.5)).toBeGreaterThan(d1);
    // Hüllkugel muss im Sichtkegel liegen: sin(fov/2) * d >= r
    expect(Math.sin((40 * Math.PI) / 360) * d1).toBeGreaterThanOrEqual(1);
  });

  it('Polarkoordinaten sind umkehrbar', () => {
    const target: Vec3 = [1, 2, 3];
    const pos: Vec3 = [4, 5, 6];
    const o = positionToOrbit(pos, target);
    const back = orbitToPosition(o, target);
    back.forEach((v, i) => expect(v).toBeCloseTo(pos[i]!, 10));
  });

  it('begrenzt Polarwinkel und Abstand', () => {
    const c = clampOrbit({ theta: 1, phi: 0, radius: 100 }, 1, 10);
    expect(c.phi).toBeGreaterThan(0);
    expect(c.radius).toBe(10);
    expect(clampOrbit({ theta: 0, phi: 4, radius: 0.1 }, 1, 10)).toMatchObject({ radius: 1 });
  });

  it('nutzt die Kamera aus der Szene oder berechnet eine passende Position', () => {
    const scene: Scene3D = { camera: [0, 0, 5], parts: [part('a', [0, 0, 0])] };
    const c = initialCamera(scene, 40, 1);
    expect(c.target).toEqual([0, 0, 0]);
    expect(c.orbit.radius).toBeCloseTo(5, 10);
    expect(c.orbit.theta).toBeCloseTo(0, 10);
    // zu nahe Kamera wird auf passenden Abstand zurückgesetzt, Richtung bleibt
    const near = initialCamera({ camera: [0, 0, 0.5], parts: scene.parts }, 40, 1);
    expect(near.orbit.radius).toBeCloseTo(fitDistance(Math.sqrt(3) / 2, 40, 1), 10);
    const auto = initialCamera({ parts: scene.parts }, 40, 1);
    expect(auto.orbit.radius).toBeCloseTo(fitDistance(Math.sqrt(3) / 2, 40, 1), 10);
    expect(auto.minRadius).toBeLessThan(auto.orbit.radius);
    expect(auto.maxRadius).toBeGreaterThan(auto.orbit.radius);
  });
});

describe('Szenen-Hilfen', () => {
  it('liest Szenen defensiv aus Entitätsdaten', () => {
    expect(sceneOf(null)).toBeNull();
    expect(sceneOf({})).toBeNull();
    expect(sceneOf({ scene: { parts: [] } })).toBeNull();
    expect(sceneOf({ scene: { parts: [part('a', [0, 0, 0])] } })?.parts).toHaveLength(1);
  });

  it('listet verknüpfte Komponenten ohne Duplikate', () => {
    const scene: Scene3D = {
      parts: [part('a', [0, 0, 0], { component: 'component:x' }), part('b', [0, 0, 0], { component: 'component:x' }), part('c', [0, 0, 0])],
    };
    expect(linkedComponents(scene)).toEqual(['component:x']);
  });
});

describe('componentFacts', () => {
  const s = (id: string, type: 'fault' | 'spare_part' | 'device') => ({ id, type, slug: id, title: id, summary: '', tags: [], demo: false, reviewStatus: 'geprueft' as const, flags: [] });
  it('zählt Fehlerbilder und Ersatzteile eindeutig über alle Gruppen', () => {
    const groups: RelationGroup[] = [
      { rel: 'causes', direction: 'out', label: 'x', items: [s('fault:a', 'fault'), s('fault:b', 'fault')] },
      { rel: 'related', direction: 'out', label: 'y', items: [s('fault:a', 'fault'), s('device:d', 'device')] },
      { rel: 'fits', direction: 'in', label: 'z', items: [s('spare_part:e', 'spare_part')] },
    ];
    const f = componentFacts(groups);
    expect(f.faults.map((x) => x.id)).toEqual(['fault:a', 'fault:b']);
    expect(f.spareParts).toHaveLength(1);
  });
  it('bildet Singular und Plural', () => {
    expect(plural(1, 'Fehlerbild', 'Fehlerbilder')).toBe('1 Fehlerbild');
    expect(plural(0, 'Fehlerbild', 'Fehlerbilder')).toBe('0 Fehlerbilder');
  });
});
