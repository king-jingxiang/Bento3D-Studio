import { Font, type FontData } from 'three/examples/jsm/loaders/FontLoader.js';
import fontJson from '../assets/helvetiker_regular.typeface.json';
import type { ManifoldToplevel, Polygons } from 'manifold-3d';
import type { CS } from './manifold';

const font = new Font(fontJson as unknown as FontData);

export interface TextShape {
  cs: CS;
  width: number;
  height: number;
}

export function sanitizeLabelText(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '')
    .slice(0, 16)
    .trim();
}

export function measureText(text: string, size: number): { width: number; height: number } {
  const clean = sanitizeLabelText(text);
  if (!clean) return { width: 0, height: 0 };
  const shapes = font.generateShapes(clean, size);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    for (const point of shape.getPoints(2)) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    for (const hole of shape.holes) {
      for (const point of hole.getPoints(2)) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
  }
  if (!Number.isFinite(minX)) return { width: 0, height: 0 };
  return { width: maxX - minX, height: maxY - minY };
}

/** Build a centred, hole-aware cross-section for a single line of text. */
export function buildTextCS(
  wasm: ManifoldToplevel,
  text: string,
  size: number,
): TextShape | null {
  const clean = sanitizeLabelText(text);
  if (!clean) return null;
  const shapes = font.generateShapes(clean, size);
  const contours: number[][][] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const addContour = (points: { x: number; y: number }[]) => {
    if (points.length < 3) return;
    const contour = points
      .map((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
        return [point.x, point.y];
      })
      .slice();
    const first = contour[0];
    const last = contour[contour.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-4) contour.pop();
    if (contour.length >= 3) contours.push(contour);
  };

  for (const shape of shapes) {
    addContour(shape.getPoints(5));
    for (const hole of shape.holes) {
      addContour(hole.getPoints(5));
    }
  }
  if (contours.length === 0 || !Number.isFinite(minX)) return null;

  const cs = new wasm.CrossSection(contours as unknown as Polygons, 'EvenOdd');
  const width = maxX - minX;
  const height = maxY - minY;
  const centered = cs.translate([-(minX + maxX) / 2, -(minY + maxY) / 2]);
  cs.delete();
  return { cs: centered, width, height };
}
