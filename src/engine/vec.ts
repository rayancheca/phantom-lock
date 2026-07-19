import type { Vec2 } from './types';

export const vec = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export const len = (a: Vec2): number => Math.hypot(a.x, a.y);

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const norm = (a: Vec2): Vec2 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};

/** 90° rotation (CCW in math coords, CW on a y-down canvas — orientation only matters relatively). */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export const fromAngle = (rad: number): Vec2 => ({ x: Math.cos(rad), y: Math.sin(rad) });

export const rotate = (a: Vec2, rad: number): Vec2 => ({
  x: a.x * Math.cos(rad) - a.y * Math.sin(rad),
  y: a.x * Math.sin(rad) + a.y * Math.cos(rad),
});

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Mirror direction d about surface normal n (n must be unit length). */
export const reflect = (d: Vec2, n: Vec2): Vec2 => sub(d, scale(n, 2 * dot(d, n)));
