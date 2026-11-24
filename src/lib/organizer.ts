import type { ManifoldToplevel, SimplePolygon } from 'manifold-3d';
import type { LayerConfig, OrganizerConfig, Params, PartInfo, WallOptions } from '../types';
import {
  DEFAULT_LAYER_WALL,
  DEFAULT_ORGANIZER,
  HOLE_MARGIN,
  LIMITS,
  clamp,
  isOutlineShape,
} from '../types';
import { layoutCells, sanitizeGrid } from './grid';
import { outlinePolygon, outlineRadius } from './shapes';
import {
  WasmScope,
  extrudeBetween,
  meshToPartMesh,
  roundedRectCS,
  subtractAll,
  type CS,
  type Solid,
} from './manifold';

const LAYER_COLORS = ['#3b9be8', '#57a9e5', '#4fb79a', '#e2a44f', '#8b7fd6', '#e2777f'];

export interface OrganizerBuild {
  parts: PartInfo[];
  warnings: string[];
  totalHeight: number;
}

function sanitizeLayerWall(wall?: WallOptions | null): WallOptions {
  const d = DEFAULT_LAYER_WALL;
  return {
    enabled: wall?.enabled === true,
    shape: wall?.shape === 'circle' ? 'circle' : 'hexagon',
    holeSize: clamp(
      Number(wall?.holeSize) || d.holeSize,
      LIMITS.holeSize[0],
      LIMITS.holeSize[1],
    ),
    margin:
      wall?.margin === 'dense' || wall?.margin === 'relaxed' ? wall.margin : 'normal',
  };
}

export function organizerTotalHeight(layers: LayerConfig[]): number {
  const total = layers.reduce((sum, layer) => sum + layer.height, 0);
  return total + (layers[layers.length - 1]?.stackable ? 1 : 0);
}

export function sanitizeOrganizer(organizer: OrganizerConfig): OrganizerConfig {
  const source = organizer.layers.length > 0 ? organizer.layers : DEFAULT_ORGANIZER.layers;
  const layers: LayerConfig[] = source.slice(0, LIMITS.layerCount[1]).map((layer, index) => ({
    id: layer.id || `layer-${index + 1}`,
    name: layer.name?.trim() || `第 ${index + 1} 层`,
    depth: clamp(Number(layer.depth) || 100, LIMITS.layerDepth[0], LIMITS.layerDepth[1]),
    height: clamp(Number(layer.height) || 24, LIMITS.layerHeight[0], LIMITS.layerHeight[1]),
    shape: isOutlineShape(layer.shape) ? layer.shape : 'rounded',
    grid: sanitizeGrid(
      layer.grid ?? {
        cols: [1],
        rows: [1],
        merges: [],
      },
    ),
    stackable: layer.stackable === true,
    wall: sanitizeLayerWall(layer.wall),
  }));

  return {
    layers,
    align: organizer.align === 'center' ? 'center' : 'back',
    dividerInset: clamp(
      Number(organizer.dividerInset) || 0,
      LIMITS.dividerInset[0],
      LIMITS.dividerInset[1],
    ),
  };
}

function buildInnerCS(
  wasm: ManifoldToplevel,
  scope: WasmScope,
  layer: LayerConfig,
  width: number,
  thickness: number,
  fillet: number,
): CS {
  if (layer.shape === 'rect' || layer.shape === 'rounded' || layer.shape === 'capsule') {
    const radius = Math.max(
      0.2,
      outlineRadius(layer.shape, width, layer.depth, fillet) - thickness,
    );
    return scope.track(
      roundedRectCS(wasm, width - thickness * 2, layer.depth - thickness * 2, radius, 10),
    );
  }

  const outer = scope.track(
    new wasm.CrossSection([outlinePolygon(layer.shape, width, layer.depth, fillet)], 'Positive'),
  );
  const inner = scope.track(
    outer.offset(-thickness, layer.shape === 'ellipse' ? 'Round' : 'Miter', 2, 12),
  );
  return inner;
}

function transformed(
  scope: WasmScope,
  solid: Solid,
  rotate: [number, number, number] | null,
  translate: [number, number, number],
) {
  const rotated = rotate ? scope.track(solid.rotate(rotate)) : solid;
  return scope.track(rotated.translate(translate));
}

function holeShapeCS(
  wasm: ManifoldToplevel,
  shape: WallOptions['shape'],
  size: number,
): CS {
  if (shape === 'circle') return wasm.CrossSection.circle(size / 2, 16);
  const radius = size / 2;
  const points = Array.from({ length: 6 }, (_, index): [number, number] => {
    const angle = (Math.PI / 3) * index;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  return new wasm.CrossSection([points], 'Positive');
}

interface FaceSpan {
  min: number;
  max: number;
}

function spanOf(points: SimplePolygon, axis: 0 | 1, coordinate: number): FaceSpan | null {
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const other = axis === 0 ? 1 : 0;
    if (Math.abs(a[other] - coordinate) > 1e-4 || Math.abs(b[other] - coordinate) > 1e-4) {
      continue;
    }
    const v0 = a[axis];
    const v1 = b[axis];
    if (Math.abs(v0 - v1) < 1e-4) continue;
    min = Math.min(min, v0, v1);
    max = Math.max(max, v0, v1);
  }
  return min < max ? { min, max } : null;
}

/** Straight front/back (y = ±depth/2) and left/right (x = ±width/2) wall spans. */
function wallFaceSpans(
  shape: LayerConfig['shape'],
  width: number,
  depth: number,
  fillet: number,
): { front: FaceSpan | null; back: FaceSpan | null; left: FaceSpan | null; right: FaceSpan | null } {
  const points = outlinePolygon(shape, width, depth, fillet);
  return {
    front: spanOf(points, 0, -depth / 2),
    back: spanOf(points, 0, depth / 2),
    left: spanOf(points, 1, -width / 2),
    right: spanOf(points, 1, width / 2),
  };
}

function buildLayerWallHoles(
  wasm: ManifoldToplevel,
  scope: WasmScope,
  layer: LayerConfig,
  width: number,
  depth: number,
  height: number,
  thickness: number,
  fillet: number,
): Solid[] {
  const wall = layer.wall;
  if (!wall.enabled) return [];

  const gap = HOLE_MARGIN[wall.margin];
  const zMin = Math.min(3, height / 4);
  const zMax = height - 3;
  const availableZ = zMax - zMin;
  if (availableZ < 4) return [];

  const spans = wallFaceSpans(layer.shape, width, depth, fillet);
  const maxSpan = Math.max(
    ...[spans.front, spans.back, spans.left, spans.right].map((span) =>
      span ? span.max - span.min : 0,
    ),
  );
  if (maxSpan < 3) return [];

  const isHex = wall.shape === 'hexagon';
  const holeHeight = (size: number) => (isHex ? size * 0.866 : size);
  const size = clamp(
    wall.holeSize,
    2.5,
    Math.max(2.5, Math.min(availableZ - 0.5, maxSpan - 0.5)),
  );
  if (size < 2.5) return [];

  const hPitch = size + gap;
  const vPitch = holeHeight(size) + gap;
  const rowCount = Math.floor((availableZ + gap) / vPitch);
  if (rowCount < 1) return [];

  const holeCS = scope.track(holeShapeCS(wasm, wall.shape, size));
  const depthOfCut = thickness + 1.6;
  const cutters: Solid[] = [];

  const buildFace = (
    span: FaceSpan | null,
    makeCutter: (horizontal: number, z: number) => Solid,
  ) => {
    if (!span) return;
    const length = span.max - span.min;
    const cols = Math.floor((length + gap) / hPitch);
    if (cols < 1) return;
    const center = (span.min + span.max) / 2;
    const groupWidth = (cols - 1) * hPitch;
    for (let row = 0; row < rowCount; row += 1) {
      const z = zMin + holeHeight(size) / 2 + row * vPitch;
      if (z + holeHeight(size) / 2 > zMax + 0.01) continue;
      const stagger = isHex && row % 2 === 1 ? hPitch / 2 : 0;
      for (let col = 0; col < cols; col += 1) {
        const horizontal = -groupWidth / 2 + col * hPitch + stagger;
        if (Math.abs(horizontal) + size / 2 > length / 2 + 0.01) continue;
        cutters.push(makeCutter(center + horizontal, z));
      }
    }
  };

  buildFace(spans.front, (horizontal, z) =>
    transformed(
      scope,
      scope.track(holeCS.extrude(depthOfCut)),
      [90, 0, 0],
      [horizontal, -depth / 2 + thickness / 2 + depthOfCut / 2, z],
    ),
  );
  buildFace(spans.back, (horizontal, z) =>
    transformed(
      scope,
      scope.track(holeCS.extrude(depthOfCut)),
      [90, 0, 0],
      [horizontal, depth / 2 - thickness / 2 + depthOfCut / 2, z],
    ),
  );
  buildFace(spans.left, (horizontal, z) =>
    transformed(
      scope,
      scope.track(holeCS.extrude(depthOfCut)),
      [0, -90, 0],
      [-width / 2 + thickness / 2 + depthOfCut / 2, horizontal, z],
    ),
  );
  buildFace(spans.right, (horizontal, z) =>
    transformed(
      scope,
      scope.track(holeCS.extrude(depthOfCut)),
      [0, -90, 0],
      [width / 2 - thickness / 2 + depthOfCut / 2, horizontal, z],
    ),
  );

  return cutters.slice(0, 900);
}

function buildLayerMesh(
  wasm: ManifoldToplevel,
  params: Params,
  layer: LayerConfig,
  dividerInset: number,
  warnings: string[],
): PartInfo['mesh'] {
  const scope = new WasmScope();
  try {
    const width = clamp(params.width, LIMITS.width[0], LIMITS.width[1]);
    const thickness = clamp(params.thickness, LIMITS.thickness[0], LIMITS.thickness[1]);
    const fillet = clamp(
      params.fillet,
      0,
      Math.max(0, Math.min(width, layer.depth) / 2 - thickness - 0.4),
    );
    const height = clamp(layer.height, LIMITS.layerHeight[0], LIMITS.layerHeight[1]);
    const depth = clamp(layer.depth, LIMITS.layerDepth[0], LIMITS.layerDepth[1]);
    const safeLayer: LayerConfig = { ...layer, depth, height };

    const outline = scope.track(
      new wasm.CrossSection([outlinePolygon(safeLayer.shape, width, depth, fillet)], 'Positive'),
    );
    let solid = scope.track(outline.extrude(height));

    const innerCS = buildInnerCS(wasm, scope, safeLayer, width, thickness, fillet);
    if (innerCS.isEmpty()) {
      throw new Error('壁厚过大，无法生成内部空间');
    }

    const floorZ = Math.min(thickness, Math.max(1, height - 1.5));
    const dividerHeight = Math.max(floorZ + 1, height - dividerInset);

    // Open the whole interior above the divider height so the rim stays full height.
    if (dividerHeight < height) {
      const upper = extrudeBetween(scope, innerCS, dividerHeight, height + 2);
      solid = scope.track(solid.subtract(upper));
    }

    const cells = layoutCells(safeLayer.grid, width, depth, thickness);
    const needsClip = safeLayer.shape !== 'rect' && safeLayer.shape !== 'rounded';
    const cavities: ReturnType<typeof extrudeBetween>[] = [];

    for (const cell of cells) {
      const cellWidth = cell.x1 - cell.x0;
      const cellDepth = cell.y1 - cell.y0;
      if (cellWidth < 0.8 || cellDepth < 0.8) continue;
      const radius = Math.max(0, Math.min(1.5, Math.min(cellWidth, cellDepth) / 2 - 0.05));
      const base = roundedRectCS(wasm, cellWidth, cellDepth, radius, 4);
      const placed = scope.track(
        base.translate([(cell.x0 + cell.x1) / 2, (cell.y0 + cell.y1) / 2]),
      );
      base.delete();

      let clipped = placed;
      if (needsClip) {
        clipped = scope.track(wasm.CrossSection.intersection(placed, innerCS));
        if (clipped.isEmpty()) continue;
      }
      cavities.push(extrudeBetween(scope, clipped, floorZ, dividerHeight + 0.6));
    }

    solid = subtractAll(scope, wasm, solid, cavities);

    if (safeLayer.stackable) {
      // 1 mm lip on top, matching groove underneath, so layers interlock like trays.
      const lipHeight = 1;
      const lipRing = scope.track(outline.subtract(innerCS));
      const lip = scope.track(
        scope.track(lipRing.extrude(lipHeight)).translate([0, 0, height]),
      );
      solid = scope.track(wasm.Manifold.union([solid, lip]));

      const grooveDepth = Math.min(1.2, Math.max(0.4, floorZ - 0.25));
      let grooveOuter: CS;
      let grooveInner: CS;
      if (
        safeLayer.shape === 'rect' ||
        safeLayer.shape === 'rounded' ||
        safeLayer.shape === 'capsule'
      ) {
        const radius = outlineRadius(safeLayer.shape, width, depth, fillet);
        grooveOuter = scope.track(
          roundedRectCS(wasm, width + 0.4, depth + 0.4, Math.max(0.2, radius + 0.2), 10),
        );
        grooveInner = scope.track(
          roundedRectCS(
            wasm,
            width - (thickness + 0.45) * 2,
            depth - (thickness + 0.45) * 2,
            Math.max(0.2, radius - thickness - 0.45),
            10,
          ),
        );
      } else {
        const join = safeLayer.shape === 'ellipse' ? 'Round' : 'Miter';
        grooveOuter = scope.track(outline.offset(0.2, join, 2, 12));
        grooveInner = scope.track(innerCS.offset(-0.45, join, 2, 12));
      }

      if (!grooveOuter.isEmpty() && !grooveInner.isEmpty()) {
        const grooveRing = scope.track(grooveOuter.subtract(grooveInner));
        const groove = scope.track(
          scope.track(grooveRing.extrude(grooveDepth + 0.1)).translate([0, 0, -0.1]),
        );
        solid = scope.track(solid.subtract(groove));
      }
    }

    if (safeLayer.wall.enabled) {
      const cutters = buildLayerWallHoles(
        wasm,
        scope,
        safeLayer,
        width,
        depth,
        height,
        thickness,
        fillet,
      );
      if (cutters.length === 0) {
        warnings.push(`${layer.name}：当前外形或尺寸无法放置墙面孔洞，已跳过墙面花纹。`);
      } else {
        try {
          solid = subtractAll(scope, wasm, solid, cutters);
        } catch (error) {
          console.warn('Layer wall pattern skipped', error);
          warnings.push(`${layer.name}：墙面花纹与当前几何冲突，已跳过。`);
        }
      }
    }

    if (solid.isEmpty()) {
      throw new Error('当前层几何为空，请调整尺寸或分格。');
    }
    return meshToPartMesh(solid.getMesh());
  } finally {
    scope.dispose();
  }
}

export function buildOrganizer(
  params: Params,
  organizer: OrganizerConfig,
  wasm: ManifoldToplevel,
): OrganizerBuild {
  const clean = sanitizeOrganizer(organizer);
  const width = clamp(params.width, LIMITS.width[0], LIMITS.width[1]);
  const baseDepth = Math.max(...clean.layers.map((layer) => layer.depth));
  const backY = -baseDepth / 2;
  const warnings: string[] = [];
  const parts: PartInfo[] = [];
  let cursorZ = 0;

  clean.layers.forEach((layer, index) => {
    const previous = clean.layers[index - 1];
    if (previous && layer.depth > previous.depth + 0.5) {
      warnings.push(`第 ${index + 1} 层比下层更深，装配时前部会悬空。`);
    }
    if (previous?.stackable && !layer.stackable) {
      warnings.push(
        `第 ${index + 1} 层未开启底部堆叠，会与下层的堆叠唇边干涉，建议相邻层同时开启。`,
      );
    }

    const cells = layoutCells(layer.grid, width, layer.depth, params.thickness);
    if (cells.some((cell) => cell.x1 - cell.x0 < 3 || cell.y1 - cell.y0 < 3)) {
      warnings.push(`第 ${index + 1} 层存在小于 3 mm 的格子，建议减少行列数。`);
    }

    try {
      const mesh = buildLayerMesh(wasm, params, layer, clean.dividerInset, warnings);
      const offsetY = clean.align === 'center' ? 0 : backY + layer.depth / 2;
      parts.push({
        kind: 'layer',
        name: `${layer.name}`,
        mesh,
        color: LAYER_COLORS[index % LAYER_COLORS.length],
        width,
        depth: layer.depth,
        height: layer.height + (layer.stackable ? 1 : 0),
        layerIndex: index,
        offset: { x: 0, y: offsetY, z: cursorZ },
      });
      cursorZ += layer.height;
    } catch (error) {
      warnings.push(`第 ${index + 1} 层生成失败：${(error as Error).message}`);
    }
  });

  return { parts, warnings, totalHeight: organizerTotalHeight(clean.layers) };
}
