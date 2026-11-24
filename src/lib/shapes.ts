import type { SimplePolygon } from 'manifold-3d';
import type { OutlineShape } from '../types';
import { roundedRectPolygon } from './manifold';

export function outlineRadius(
  shape: OutlineShape,
  width: number,
  depth: number,
  fillet: number,
): number {
  const half = Math.min(width, depth) / 2 - 0.001;
  if (shape === 'capsule') return Math.max(0, half);
  if (shape === 'rounded') return Math.max(0, Math.min(fillet, half));
  return 0;
}

/** Closed, centred outline polygon (CCW) shared by the geometry kernel and the SVG editor. */
export function outlinePolygon(
  shape: OutlineShape,
  width: number,
  depth: number,
  fillet: number,
): SimplePolygon {
  const w = Math.max(width, 0.01);
  const d = Math.max(depth, 0.01);
  const hw = w / 2;
  const hd = d / 2;

  if (shape === 'rect' || shape === 'rounded' || shape === 'capsule') {
    return roundedRectPolygon(w, d, outlineRadius(shape, w, d, fillet), 10);
  }

  if (shape === 'ellipse') {
    const segments = 72;
    return Array.from({ length: segments }, (_, index): [number, number] => {
      const angle = (Math.PI * 2 * index) / segments;
      return [Math.cos(angle) * hw, Math.sin(angle) * hd];
    });
  }

  if (shape === 'hexagon') {
    return [
      [hw, 0],
      [hw / 2, hd],
      [-hw / 2, hd],
      [-hw, 0],
      [-hw / 2, -hd],
      [hw / 2, -hd],
    ];
  }

  const cut = Math.min(hw, hd) * 0.32;
  return [
    [hw - cut, -hd],
    [hw, -hd + cut],
    [hw, hd - cut],
    [hw - cut, hd],
    [-hw + cut, hd],
    [-hw, hd - cut],
    [-hw, -hd + cut],
    [-hw + cut, -hd],
  ];
}

export function outlinePath(
  shape: OutlineShape,
  width: number,
  depth: number,
  fillet: number,
): string {
  const points = outlinePolygon(shape, width, depth, fillet);
  return `${points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(2)} ${point[1].toFixed(2)}`)
    .join(' ')} Z`;
}
