import type { Vec2 } from '../types';

/** RGBA bytes, as in `ImageData.data`. */
export interface GrayImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** A detected wall segment in image pixel space. */
export interface PxSegment {
  a: Vec2;
  b: Vec2;
}

/** A binary image: 1 where the predicate holds, 0 elsewhere. */
export interface Mask {
  data: Uint8Array;
  width: number;
  height: number;
}

export function emptyMask(width: number, height: number): Mask {
  return { data: new Uint8Array(width * height), width, height };
}

export function segLength(s: PxSegment): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

/** Undirected heading in [0, PI) — walls have no direction. */
export function segHeading(s: PxSegment): number {
  const a = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
  return ((a % Math.PI) + Math.PI) % Math.PI;
}

/** Smallest angle between two undirected headings, in [0, PI/2]. */
export function headingGap(p: number, q: number): number {
  const d = Math.abs(p - q) % Math.PI;
  return d > Math.PI / 2 ? Math.PI - d : d;
}
