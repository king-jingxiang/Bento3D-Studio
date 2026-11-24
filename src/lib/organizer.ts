import type { ManifoldToplevel } from 'manifold-3d';
import type { LayerConfig, OrganizerConfig, Params, PartInfo } from '../types';
import {
  DEFAULT_ORGANIZER,
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
} from './manifold';

const LAYER_COLORS = ['#3b9be8', '#57a9e5', '#4fb79a', '#e2a44f', '#8b7fd6', '#e2777f'];

export interface OrganizerBuild {
  parts: PartInfo[];
  warnings: string[];
  totalHeight: number;
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

function buildLayerMesh(
  wasm: ManifoldToplevel,
  params: Params,
  layer: LayerConfig,
  dividerInset: number,
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

    const cells = layoutCells(layer.grid, width, layer.depth, params.thickness);
    if (cells.some((cell) => cell.x1 - cell.x0 < 3 || cell.y1 - cell.y0 < 3)) {
      warnings.push(`第 ${index + 1} 层存在小于 3 mm 的格子，建议减少行列数。`);
    }

    try {
      const mesh = buildLayerMesh(wasm, params, layer, clean.dividerInset);
      const offsetY = clean.align === 'center' ? 0 : backY + layer.depth / 2;
      parts.push({
        kind: 'layer',
        name: `${layer.name}`,
        mesh,
        color: LAYER_COLORS[index % LAYER_COLORS.length],
        width,
        depth: layer.depth,
        height: layer.height,
        layerIndex: index,
        offset: { x: 0, y: offsetY, z: cursorZ },
      });
      cursorZ += layer.height;
    } catch (error) {
      warnings.push(`第 ${index + 1} 层生成失败：${(error as Error).message}`);
    }
  });

  return { parts, warnings, totalHeight: cursorZ };
}
