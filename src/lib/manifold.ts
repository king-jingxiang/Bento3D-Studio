import Module from 'manifold-3d';
import type {
  CrossSection as CrossSectionType,
  Manifold as ManifoldType,
  ManifoldToplevel,
  Mesh,
  SimplePolygon,
} from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { PartMesh } from '../types';

let modulePromise: Promise<ManifoldToplevel> | null = null;

export async function getManifoldModule(): Promise<ManifoldToplevel> {
  if (!modulePromise) {
    modulePromise = Module({ locateFile: () => wasmUrl }).then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return modulePromise;
}

export type CS = CrossSectionType;
export type Solid = ManifoldType;

/** Collects WASM objects so they can be released after a build. */
export class WasmScope {
  private items: Array<{ delete(): void }> = [];

  track<T extends { delete(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }

  dispose() {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      try {
        this.items[i].delete();
      } catch {
        // Ignore objects that were already released by the wasm bindings.
      }
    }
    this.items = [];
  }
}

export interface RoundedRectOptions {
  width: number;
  depth: number;
  radius: number;
  segments?: number;
}

export function roundedRectPolygon(
  width: number,
  depth: number,
  radius: number,
  segments = 8,
): SimplePolygon {
  const w = Math.max(width, 0.01);
  const d = Math.max(depth, 0.01);
  const r = Math.max(0, Math.min(radius, w / 2 - 0.001, d / 2 - 0.001));
  if (r < 0.01) {
    return [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ];
  }
  const hw = w / 2;
  const hh = d / 2;
  const corners = [
    { cx: hw - r, cy: hh - r, start: 0 },
    { cx: -hw + r, cy: hh - r, start: Math.PI / 2 },
    { cx: -hw + r, cy: -hh + r, start: Math.PI },
    { cx: hw - r, cy: -hh + r, start: Math.PI * 1.5 },
  ];
  const points: [number, number][] = [];
  for (const corner of corners) {
    for (let i = 0; i <= segments; i += 1) {
      const angle = corner.start + (Math.PI / 2) * (i / segments);
      points.push([
        corner.cx + Math.cos(angle) * r,
        corner.cy + Math.sin(angle) * r,
      ]);
    }
  }
  return points;
}

export function roundedRectCS(
  wasm: ManifoldToplevel,
  width: number,
  depth: number,
  radius: number,
  segments = 8,
): CS {
  return new wasm.CrossSection(
    [roundedRectPolygon(width, depth, radius, segments)],
    'Positive',
  );
}

export function polygonCS(points: SimplePolygon): (wasm: ManifoldToplevel) => CS {
  return (wasm) => new wasm.CrossSection([points], 'Positive');
}

/** Extrude a cross-section between two Z heights. */
export function extrudeBetween(
  scope: WasmScope,
  cs: CS,
  z0: number,
  z1: number,
): Solid {
  const height = Math.max(0.001, z1 - z0);
  const solid = scope.track(cs.extrude(height));
  scope.track(cs);
  return scope.track(solid.translate([0, 0, z0]));
}

export function unionAll(scope: WasmScope, wasm: ManifoldToplevel, solids: Solid[]): Solid {
  if (solids.length === 0) {
    return scope.track(wasm.Manifold.cube([0.001, 0.001, 0.001]));
  }
  if (solids.length === 1) return solids[0];
  return scope.track(wasm.Manifold.union(solids));
}

export function subtractAll(
  scope: WasmScope,
  wasm: ManifoldToplevel,
  base: Solid,
  cutters: Solid[],
): Solid {
  if (cutters.length === 0) return base;
  return scope.track(wasm.Manifold.difference([base, ...cutters]));
}

export function meshToPartMesh(mesh: Mesh): PartMesh {
  const result = {
    vertProperties: new Float32Array(mesh.vertProperties),
    triVerts: new Uint32Array(mesh.triVerts),
  };
  (mesh as unknown as { delete?: () => void }).delete?.();
  return result;
}
