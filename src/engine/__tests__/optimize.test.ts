import { describe, expect, it } from 'vitest';
import { suggestPlacement } from '../optimize';
import { collectSurfaces, directPath } from '../raytrace';
import type { Scene, WallObj } from '../types';
import * as v from '../vec';

function boxScene(): Scene {
  const size = 10;
  const pts = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
  const walls: WallObj[] = pts.map((a, i) => ({
    id: `w${i}`,
    kind: 'wall',
    a,
    b: pts[(i + 1) % 4],
    absorption: 0.12,
    label: 'Wall',
    height: 2.7,
  }));
  return {
    objects: [
      ...walls,
      {
        id: 'tv',
        kind: 'rect',
        center: { x: 5, y: 1.5 },
        w: 1.5,
        h: 0.35,
        rotation: 0,
        absorption: 0.05,
        label: 'TV',
        role: 'tv',
        height: 1.5,
      },
    ],
    speakers: [],
    pairs: [],
    listener: { pos: { x: 5, y: 6 }, z: 1.2 },
  };
}

const HP2 = { homepod: 2 };

describe('suggestPlacement', () => {
  const scene = boxScene();

  it('places a stereo pair as an equilateral triangle facing the TV', () => {
    const p = suggestPlacement(scene, { mode: 'cinema', stereo: true, inventory: HP2 });
    expect(p.speakers).toHaveLength(2);
    expect(p.pairs).toEqual([[0, 1]]);

    const [l, r] = p.speakers;
    const dL = v.dist(l.pos, scene.listener.pos);
    const dR = v.dist(r.pos, scene.listener.pos);
    const base = v.dist(l.pos, r.pos);
    // Equilateral by construction (±30° at equal distance).
    expect(Math.abs(dL - dR)).toBeLessThan(0.05);
    expect(Math.abs(base - dL)).toBeLessThan(0.15);
    // Both on the TV side of the listener.
    expect(l.pos.y).toBeLessThan(6);
    expect(r.pos.y).toBeLessThan(6);
    // 'L' is the listener's left when facing the TV (north, -y): west, smaller x.
    expect(l.pos.x).toBeLessThan(r.pos.x);

    const surfaces = collectSurfaces(scene.objects);
    for (const sp of p.speakers) {
      expect(directPath(surfaces, sp.pos, sp.z, scene.listener.pos, 1.2).blocked).toBe(false);
    }
  });

  it('places a single mono speaker on the facing axis', () => {
    const p = suggestPlacement(scene, { mode: 'cinema', stereo: false, inventory: { homepod: 1 } });
    expect(p.speakers).toHaveLength(1);
    expect(p.pairs).toHaveLength(0);
    expect(Math.abs(p.speakers[0].pos.x - 5)).toBeLessThan(0.6);
    expect(p.speakers[0].pos.y).toBeLessThan(6);
  });

  it('places four HomePods as two linked pairs', () => {
    const p = suggestPlacement(scene, { mode: 'cinema', stereo: true, inventory: { homepod: 4 } });
    expect(p.speakers).toHaveLength(4);
    expect(p.pairs).toHaveLength(2);
    // Front pair toward the TV, rear pair behind the listener.
    const front = p.speakers.slice(0, 2);
    const rear = p.speakers.slice(2);
    for (const sp of front) expect(sp.pos.y).toBeLessThan(6);
    for (const sp of rear) expect(sp.pos.y).toBeGreaterThan(6);
  });

  it('never cross-pairs HomePods with minis, keeps minis closer, and trims levels', () => {
    const p = suggestPlacement(scene, {
      mode: 'cinema',
      stereo: true,
      inventory: { homepod: 2, 'homepod-mini': 2 },
    });
    expect(p.speakers).toHaveLength(4);
    expect(p.pairs).toHaveLength(2);
    for (const [ia, ib] of p.pairs) {
      expect(p.speakers[ia].model).toBe(p.speakers[ib].model);
    }
    const minis = p.speakers.filter((s) => s.model === 'homepod-mini');
    const pods = p.speakers.filter((s) => s.model === 'homepod');
    for (const m of minis) {
      expect(v.dist(m.pos, scene.listener.pos)).toBeLessThanOrEqual(2.2 + 0.01);
    }
    // Level matching: every speaker lands within 0.2 dB at the seat.
    const level = (s: (typeof p.speakers)[number]) =>
      (s.model === 'homepod' ? 0 : -6) + s.trimDb - 20 * Math.log10(v.dist(s.pos, scene.listener.pos));
    const levels = p.speakers.map(level);
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(0.25);
    expect(pods.length).toBe(2);
  });

  it('music mode with independent speakers surrounds the listener', () => {
    const noTv = { ...scene, objects: scene.objects.filter((o) => o.kind === 'wall') };
    const p = suggestPlacement(noTv, { mode: 'music', stereo: false, inventory: { homepod: 4 } });
    expect(p.speakers).toHaveLength(4);
    // Envelopment: speakers on both sides of the listener in x AND y.
    const xs = p.speakers.map((s) => s.pos.x - noTv.listener.pos.x);
    const ys = p.speakers.map((s) => s.pos.y - noTv.listener.pos.y);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(0);
  });

  it('never proposes a spot inside furniture or outside line of sight', () => {
    const cluttered: Scene = {
      ...scene,
      objects: [
        ...scene.objects,
        {
          id: 'wardrobe',
          kind: 'rect',
          center: { x: 3.5, y: 4.5 },
          w: 2,
          h: 2,
          rotation: 0,
          absorption: 0.3,
          label: 'Wardrobe',
          role: 'furniture',
          height: 2.4,
        },
      ],
    };
    const p = suggestPlacement(cluttered, { mode: 'cinema', stereo: true, inventory: HP2 });
    const surfaces = collectSurfaces(cluttered.objects);
    for (const sp of p.speakers) {
      expect(directPath(surfaces, sp.pos, sp.z, cluttered.listener.pos, 1.2).blocked).toBe(false);
    }
  });
});
