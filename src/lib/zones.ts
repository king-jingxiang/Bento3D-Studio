import type { ManifoldToplevel } from 'manifold-3d';
import type {
  GridState,
  Params,
  PartInfo,
  ZoneShape,
  ZoneStyle,
  ZonesConfig,
} from '../types';
import { DEFAULT_ZONES, LIMITS, clamp, isOutlineShape, isZoneShape } from '../types';
import { layoutCells } from './grid';
import { outlinePolygon } from './shapes';
import {
  WasmScope,
  extrudeBetween,
  meshToPartMesh,
  roundedRectCS,
  subtractAll,
  type CS,
  type Solid,
} from './manifold';

const ZONE_COLORS = ['#3b9be8', '#4fb79a', '#e2a44f', '#8b7fd6', '#e2777f', '#57a9e5'];
const BODY_COLOR = '#3b9be8';

export interface ZonesBuild {
  /** Integrated one-piece body (all zones fused). */
  body: PartInfo | null;
  /** Individual printable zone parts, each with its own floor. */
  parts: PartInfo[];
  warnings: string[];
  totalHeight: number;
}

export function zoneAnchor(row: number, col: number): string {
  return `${row}-${col}`;
}

export function sanitizeZones(input?: ZonesConfig | null): ZonesConfig {
  const source = input ?? DEFAULT_ZONES;
  const styles: Record<string, ZoneStyle> = {};
  const rawStyles = source.styles && typeof source.styles === 'object' ? source.styles : {};
  for (const [key, value] of Object.entries(rawStyles)) {
    if (!/^\d+-\d+$/.test(key) || !value || typeof value !== 'object') continue;
    styles[key] = {
      height: clamp(
        Number(value.height) || source.defaultHeight || DEFAULT_ZONES.defaultHeight,
        LIMITS.zoneHeight[0],
        LIMITS.zoneHeight[1],
      ),
      shape: isZoneShape(value.shape) ? value.shape : DEFAULT_ZONES.defaultShape,
    };
  }

  return {
    outline: isOutlineShape(source.outline) ? source.outline : DEFAULT_ZONES.outline,
    defaultHeight: clamp(
      Number(source.defaultHeight) || DEFAULT_ZONES.defaultHeight,
      LIMITS.zoneHeight[0],
      LIMITS.zoneHeight[1],
    ),
    defaultShape: isZoneShape(source.defaultShape)
      ? source.defaultShape
      : DEFAULT_ZONES.defaultShape,
    styles,
  };
}

/** Resolve a zone's style, falling back to the top-left cell of a merged region. */
export function zoneStyleFor(
  cell: { r0: number; c0: number },
  zones: ZonesConfig,
): ZoneStyle {
  return (
    zones.styles[zoneAnchor(cell.r0, cell.c0)] ?? {
      height: zones.defaultHeight,
      shape: zones.defaultShape,
    }
  );
}

function buildCavityCS(
  wasm: ManifoldToplevel,
  shape: ZoneShape,
  width: number,
  depth: number,
): CS {
  const w = Math.max(0.5, width);
  const d = Math.max(0.5, depth);
  const minSide = Math.min(w, d);

  if (shape === 'circle') {
    return wasm.CrossSection.circle(minSide / 2 - 0.01, 48);
  }
  if (shape === 'ellipse') {
    return new wasm.CrossSection([outlinePolygon('ellipse', w, d, 0)], 'Positive');
  }
  if (shape === 'hexagon') {
    return new wasm.CrossSection([outlinePolygon('hexagon', w, d, 0)], 'Positive');
  }

  const radius =
    shape === 'capsule'
      ? minSide / 2 - 0.01
      : shape === 'rounded'
        ? Math.min(6, minSide / 2 - 0.01)
        : Math.min(0.8, minSide / 4);
  return roundedRectCS(wasm, w, d, radius, shape === 'rect' ? 4 : 12);
}

/** Outer bounds of a zone, expanded by a full wall on every side. */
function blockBounds(
  cell: { x0: number; x1: number; y0: number; y1: number },
  thickness: number,
) {
  return {
    x0: cell.x0 - thickness,
    x1: cell.x1 + thickness,
    y0: cell.y0 - thickness,
    y1: cell.y1 + thickness,
  };
}

export function buildZones(
  params: Params,
  grid: GridState,
  zonesInput: ZonesConfig,
  wasm: ManifoldToplevel,
): ZonesBuild {
  const zones = sanitizeZones(zonesInput);
  const warnings: string[] = [];
  const parts: PartInfo[] = [];
  const width = clamp(params.width, LIMITS.width[0], LIMITS.width[1]);
  const depth = clamp(params.depth, LIMITS.depth[0], LIMITS.depth[1]);
  const thickness = clamp(
    params.thickness,
    LIMITS.thickness[0],
    Math.min(LIMITS.thickness[1], Math.min(width, depth) / 6),
  );
  const fillet = clamp(
    params.fillet,
    0,
    Math.max(0, Math.min(width, depth) / 2 - thickness - 0.4),
  );

  const cells = layoutCells(grid, width, depth, thickness);
  if (cells.length === 0) {
    return { body: null, parts: [], warnings: ['没有可生成的分区。'], totalHeight: 0 };
  }
  if (cells.some((cell) => cell.x1 - cell.x0 < 3 || cell.y1 - cell.y0 < 3)) {
    warnings.push('存在小于 3 mm 的分区，建议减少行列数或增大尺寸。');
  }

  const styles = cells.map((cell) => zoneStyleFor(cell, zones));
  const totalHeight = Math.max(...styles.map((style) => style.height));
  const scope = new WasmScope();

  try {
    const outlineCS = scope.track(
      new wasm.CrossSection([outlinePolygon(zones.outline, width, depth, fillet)], 'Positive'),
    );
    const prism = scope.track(outlineCS.extrude(totalHeight + 2));
    const solids: Solid[] = [];

    cells.forEach((cell, index) => {
      const style = styles[index];
      const block = blockBounds(cell, thickness);
      const blockWidth = block.x1 - block.x0;
      const blockDepth = block.y1 - block.y0;
      if (blockWidth < 0.6 || blockDepth < 0.6) return;

      const blockCS = scope.track(roundedRectCS(wasm, blockWidth, blockDepth, 0, 2));
      const blockSolid = scope.track(blockCS.extrude(style.height));
      const placedBlock = scope.track(
        blockSolid.translate([
          (block.x0 + block.x1) / 2,
          (block.y0 + block.y1) / 2,
          0,
        ]),
      );
      let part: Solid = scope.track(wasm.Manifold.intersection(placedBlock, prism));
      if (part.isEmpty()) return;

      const cellWidth = cell.x1 - cell.x0;
      const cellDepth = cell.y1 - cell.y0;
      const floor = Math.min(thickness, Math.max(0.8, style.height - 1));
      const cavityCS = buildCavityCS(wasm, style.shape, cellWidth, cellDepth);
      const cavity = scope.track(
        extrudeBetween(scope, cavityCS, floor, style.height + 0.6),
      );
      const cavityPlaced = scope.track(
        cavity.translate([(cell.x0 + cell.x1) / 2, (cell.y0 + cell.y1) / 2, 0]),
      );
      part = subtractAll(scope, wasm, part, [cavityPlaced]);
      if (part.isEmpty()) return;

      solids.push(part);
      parts.push({
        kind: 'zone',
        name: `分区 ${index + 1}`,
        mesh: meshToPartMesh(part.getMesh()),
        color: ZONE_COLORS[index % ZONE_COLORS.length],
        width: blockWidth,
        depth: blockDepth,
        height: style.height,
      });
    });

    if (solids.length === 0) {
      warnings.push('所有分区几何为空，请调整尺寸或分区参数。');
      return { body: null, parts: [], warnings, totalHeight };
    }

    const bodySolid =
      solids.length === 1 ? solids[0] : scope.track(wasm.Manifold.union(solids));
    const body: PartInfo = {
      kind: 'zone',
      name: '一体盒体',
      mesh: meshToPartMesh(bodySolid.getMesh()),
      color: BODY_COLOR,
      width,
      depth,
      height: totalHeight,
    };

    return { body, parts, warnings, totalHeight };
  } finally {
    scope.dispose();
  }
}
