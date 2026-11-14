import type { ManifoldToplevel, SimplePolygon } from 'manifold-3d';
import type {
  AppMode,
  BuildResult,
  GridState,
  HoleShape,
  Params,
  PartInfo,
  PartMesh,
} from '../types';
import { HOLE_MARGIN, LIMITS, clamp, round } from '../types';
import { layoutCells } from './grid';
import { buildTextCS, measureText, sanitizeLabelText } from './font';
import {
  WasmScope,
  extrudeBetween,
  getManifoldModule,
  meshToPartMesh,
  roundedRectCS,
  type CS,
  type Solid,
  subtractAll,
} from './manifold';

interface CleanParams {
  width: number;
  depth: number;
  height: number;
  thickness: number;
  fillet: number;
  partitionHeight: number;
}

interface Zone {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

interface LabelLayout {
  text: string;
  size: number;
  width: number;
  height: number;
  centerZ: number;
  zone: Zone;
}

const COLORS = {
  tray: '#3b9be8',
  box: '#7c8ba1',
  lid: '#4fb79a',
};

export const BOX_TOP_CLEARANCE = 6;

function sanitize(params: Params): { clean: CleanParams; warnings: string[] } {
  const warnings: string[] = [];
  const width = clamp(params.width, LIMITS.width[0], LIMITS.width[1]);
  const depth = clamp(params.depth, LIMITS.depth[0], LIMITS.depth[1]);
  const height = clamp(params.height, LIMITS.height[0], LIMITS.height[1]);
  const thickness = clamp(params.thickness, 1, Math.min(5, Math.min(width, depth) / 6));
  let fillet = clamp(params.fillet, 0, Math.min(8, Math.min(width, depth) / 2 - 1));
  fillet = Math.min(fillet, Math.min(width, depth) / 2 - Math.max(0.5, thickness * 0.5));
  const partitionHeight = clamp(
    params.partitionHeight,
    Math.max(2, thickness + 0.8),
    Math.max(thickness + 1, height - 0.8),
  );
  if (Math.abs(width - params.width) > 0.01 || Math.abs(depth - params.depth) > 0.01) {
    warnings.push('外形尺寸已按可生成范围自动修正。');
  }
  return {
    clean: { width, depth, height, thickness, fillet, partitionHeight },
    warnings,
  };
}

function cellRadius(
  cell: { r0: number; c0: number; r1: number; c1: number; x1: number; x0: number; y1: number; y0: number },
  rows: number,
  cols: number,
  fillet: number,
  thickness: number,
): number {
  const touchesTrayCorner =
    (cell.r0 === 0 || cell.r1 === rows - 1) && (cell.c0 === 0 || cell.c1 === cols - 1);
  const preferred = touchesTrayCorner ? Math.max(fillet - thickness, 0.5) : 1;
  return clamp(preferred, 0, Math.min(cell.x1 - cell.x0, cell.y1 - cell.y0) / 2 - 0.1);
}

function buildLabelLayout(params: Params, clean: CleanParams): LabelLayout | null {
  if (!params.label.enabled) return null;
  const text = sanitizeLabelText(params.label.text);
  if (!text) return null;
  const availableWidth = clean.width - clean.fillet * 2 - 8;
  const availableHeight = clean.height - 8;
  if (availableWidth < 12 || availableHeight < 5) return null;

  const unit = measureText(text, 1);
  if (unit.width <= 0 || unit.height <= 0) return null;
  const target = clamp(clean.height * 0.3, 3.5, 9);
  const size = Math.min(
    target,
    availableWidth / unit.width,
    (availableHeight / unit.height) * 0.9,
  );
  const width = unit.width * size;
  const height = unit.height * size;
  const plaqueWidth = width + 4;
  const plaqueHeight = height + 3;
  if (size < 2.4 || plaqueWidth > clean.width - clean.fillet * 2 - 2) return null;

  const minCenter = 3 + plaqueHeight / 2;
  const maxCenter = clean.height - 2 - plaqueHeight / 2;
  if (maxCenter < minCenter) return null;
  const centerZ = clamp(clean.height * 0.45, minCenter, maxCenter);
  return {
    text,
    size,
    width,
    height,
    centerZ,
    zone: {
      x0: -plaqueWidth / 2,
      x1: plaqueWidth / 2,
      z0: centerZ - plaqueHeight / 2,
      z1: centerZ + plaqueHeight / 2,
    },
  };
}

function transformed(
  scope: WasmScope,
  solid: Solid,
  rotate: [number, number, number] | null,
  translate: [number, number, number],
): Solid {
  const rotated = rotate ? scope.track(solid.rotate(rotate)) : solid;
  return scope.track(rotated.translate(translate));
}

function hexagonPoints(acrossFlats: number): SimplePolygon {
  const radius = acrossFlats / 2;
  return Array.from({ length: 6 }, (_, index): [number, number] => {
    const angle = (Math.PI / 3) * index;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
}

function holeShapes(
  wasm: ManifoldToplevel,
  shape: HoleShape,
  size: number,
): CS {
  if (shape === 'circle') return wasm.CrossSection.circle(size / 2, 16);
  return new wasm.CrossSection([hexagonPoints(size)], 'Positive');
}

/**
 * Cut a staggered array of hexagon/circle holes through the four outer walls.
 */
function buildWallHoles(
  wasm: ManifoldToplevel,
  scope: WasmScope,
  params: Params,
  clean: CleanParams,
  label: LabelLayout | null,
): Solid[] {
  const { width, depth, height, thickness, fillet } = clean;
  if (!params.wall.enabled) return [];

  const gap = HOLE_MARGIN[params.wall.margin];
  const zMin = Math.min(3, height / 4);
  const zMax = height - 3;
  const availableZ = zMax - zMin;
  if (availableZ < 4) return [];

  const maxByHeight = availableZ - 0.5;
  const flatFront = width - fillet * 2;
  const flatSide = depth - fillet * 2;
  const maxByPanel = Math.min(flatFront, flatSide) - 0.5;
  const size = clamp(params.wall.holeSize, 2.5, Math.min(maxByHeight, maxByPanel));
  if (size < 2.5) return [];

  const isHex = params.wall.shape === 'hexagon';
  const holeHeight = isHex ? size * 0.866 : size;
  const hPitch = size + gap;
  const vPitch = holeHeight + gap;

  const rowCount = Math.floor((availableZ + gap) / vPitch);
  const colCount = Math.floor((Math.min(flatFront, flatSide) + gap) / hPitch);
  if (rowCount < 1 || colCount < 1) return [];

  const fingerZone: Zone | null = params.fingerPull.enabled
    ? {
        x0: -params.fingerPull.width / 2 - 1,
        x1: params.fingerPull.width / 2 + 1,
        z0: height - params.fingerPull.height - 1,
        z1: height + 2,
      }
    : null;

  const holeCS = scope.track(holeShapes(wasm, params.wall.shape, size));
  const depthOfCut = thickness + 1.6;
  const cutters: Solid[] = [];

  const buildWall = (
    panelLength: number,
    positions: (x: number, z: number, horizontal: number) => Solid | null,
    excludeZones: boolean,
  ) => {
    const cols = Math.min(colCount, Math.max(1, Math.floor((panelLength + gap) / hPitch)));
    if (cols < 1) return;
    const groupWidth = (cols - 1) * hPitch;
    for (let row = 0; row < rowCount; row += 1) {
      const z = zMin + holeHeight / 2 + row * vPitch;
      if (z + holeHeight / 2 > zMax + 0.01) continue;
      const stagger = isHex && row % 2 === 1 ? hPitch / 2 : 0;
      for (let col = 0; col < cols; col += 1) {
        const horizontal = -groupWidth / 2 + col * hPitch + stagger;
        if (Math.abs(horizontal) + size / 2 > panelLength / 2 + 0.01) continue;
        if (excludeZones && label && horizontal > label.zone.x0 && horizontal < label.zone.x1) {
          if (z > label.zone.z0 && z < label.zone.z1) continue;
        }
        if (excludeZones && fingerZone && horizontal > fingerZone.x0 && horizontal < fingerZone.x1) {
          if (z > fingerZone.z0 && z < fingerZone.z1) continue;
        }
        const cutter = positions(horizontal, z, horizontal);
        if (cutter) cutters.push(cutter);
      }
    }
  };

  // Front and back walls (normal along Y).
  const frontCutter = (horizontal: number, z: number) =>
    transformed(
      scope,
      scope.track(holeCS.extrude(depthOfCut)),
      [90, 0, 0],
      [horizontal, -depth / 2 + thickness / 2 + depthOfCut / 2, z],
    );
  const backCutter = (horizontal: number, z: number) =>
    transformed(
      scope,
      scope.track(holeCS.extrude(depthOfCut)),
      [90, 0, 0],
      [horizontal, depth / 2 - thickness / 2 + depthOfCut / 2, z],
    );
  buildWall(flatFront, frontCutter, true);
  buildWall(flatFront, backCutter, false);

  // Left and right walls (normal along X).
  const leftCutter = (horizontal: number, z: number) =>
    transformed(
      scope,
      scope.track(holeCS.extrude(depthOfCut)),
      [0, -90, 0],
      [-width / 2 + thickness / 2 + depthOfCut / 2, horizontal, z],
    );
  const rightCutter = (horizontal: number, z: number) =>
    transformed(
      scope,
      scope.track(holeCS.extrude(depthOfCut)),
      [0, -90, 0],
      [width / 2 - thickness / 2 + depthOfCut / 2, horizontal, z],
    );
  buildWall(flatSide, leftCutter, false);
  buildWall(flatSide, rightCutter, false);

  return cutters.slice(0, 900);
}

function buildFingerPull(
  wasm: ManifoldToplevel,
  scope: WasmScope,
  params: Params,
  clean: CleanParams,
): Solid | null {
  if (!params.fingerPull.enabled) return null;
  const { width, depth, height, thickness } = clean;
  const notchWidth = clamp(params.fingerPull.width, 10, Math.max(12, width - 10));
  const notchHeight = clamp(params.fingerPull.height, 6, Math.max(7, height - 2));
  const radius = Math.min(4, notchHeight / 2 - 0.1, notchWidth / 2 - 0.1);
  const shapeHeight = notchHeight + 2;
  const cs = scope.track(roundedRectCS(wasm, notchWidth, shapeHeight, radius, 8));
  const moved = scope.track(cs.translate([0, shapeHeight / 2]));
  const depthOfCut = thickness + 2;
  const solid = scope.track(moved.extrude(depthOfCut));
  return transformed(
    scope,
    solid,
    [90, 0, 0],
    [0, -depth / 2 + thickness / 2 + depthOfCut / 2, height - notchHeight],
  );
}

function buildLabel(
  wasm: ManifoldToplevel,
  scope: WasmScope,
  clean: CleanParams,
  layout: LabelLayout | null,
): Solid[] {
  if (!layout) return [];
  const { depth, thickness } = clean;
  const wallCenter = -depth / 2 + thickness / 2;
  const plaqueCS = scope.track(
    roundedRectCS(wasm, layout.width + 4, layout.height + 3, 1.5, 8),
  );
  const plaqueSolid = scope.track(plaqueCS.extrude(0.55));
  const plaque = transformed(
    scope,
    plaqueSolid,
    [90, 0, 0],
    [0, wallCenter + 0.25, layout.centerZ],
  );

  const textShape = buildTextCS(wasm, layout.text, layout.size);
  if (!textShape) return [plaque];
  scope.track(textShape.cs);
  const textSolid = scope.track(textShape.cs.extrude(0.9));
  const text = transformed(
    scope,
    textSolid,
    [90, 0, 0],
    [0, wallCenter + 0.25, layout.centerZ],
  );
  return [plaque, text];
}

function buildTray(
  wasm: ManifoldToplevel,
  params: Params,
  grid: GridState,
  clean: CleanParams,
  label: LabelLayout | null,
  warnings: string[],
): PartInfo {
  const scope = new WasmScope();
  try {
    const { width, depth, height, thickness, fillet, partitionHeight } = clean;
    const segments = Math.max(4, Math.min(14, Math.ceil(fillet * 3)));
    const outerCS = scope.track(roundedRectCS(wasm, width, depth, fillet, segments));
    let solid = scope.track(outerCS.extrude(height));

    if (params.stackable) {
      const lipHeight = 1;
      const lipOuter = scope.track(roundedRectCS(wasm, width, depth, fillet, segments));
      const lipInner = scope.track(
        roundedRectCS(
          wasm,
          width - thickness * 2,
          depth - thickness * 2,
          Math.max(0.4, fillet - thickness),
          segments,
        ),
      );
      const lipRingCS = scope.track(lipOuter.subtract(lipInner));
      const lipSolid = scope.track(lipRingCS.extrude(lipHeight));
      const lip = scope.track(lipSolid.translate([0, 0, height]));
      solid = scope.track(wasm.Manifold.union([solid, lip]));

      const grooveOuter = scope.track(roundedRectCS(wasm, width + 0.4, depth + 0.4, fillet, segments));
      const grooveInner = scope.track(
        roundedRectCS(
          wasm,
          width - (thickness + 0.45) * 2,
          depth - (thickness + 0.45) * 2,
          Math.max(0.2, fillet - thickness - 0.45),
          segments,
        ),
      );
      const grooveCS = scope.track(grooveOuter.subtract(grooveInner));
      const grooveSolid = scope.track(grooveCS.extrude(lipHeight + 0.2));
      const groove = scope.track(grooveSolid.translate([0, 0, -0.1]));
      solid = scope.track(solid.subtract(groove));
    }

    const rows = grid.rows.length;
    const cols = grid.cols.length;
    const cells = layoutCells(grid, width, depth, thickness);
    const cavities: Solid[] = [];
    for (const cell of cells) {
      const cellWidth = cell.x1 - cell.x0;
      const cellDepth = cell.y1 - cell.y0;
      if (cellWidth < 1 || cellDepth < 1) continue;
      const radius = cellRadius(cell, rows, cols, fillet, thickness);
      const cs = scope.track(
        roundedRectCS(wasm, cellWidth, cellDepth, radius, Math.max(4, Math.min(10, Math.ceil(radius * 3)))),
      );
      const cavity = extrudeBetween(
        scope,
        cs,
        thickness,
        Math.max(thickness + 0.5, partitionHeight),
      );
      cavities.push(scope.track(cavity.translate([(cell.x0 + cell.x1) / 2, (cell.y0 + cell.y1) / 2, 0])));
    }

    const upperCS = scope.track(
      roundedRectCS(
        wasm,
        width - thickness * 2,
        depth - thickness * 2,
        Math.max(0.4, fillet - thickness),
        segments,
      ),
    );
    const upperCavity = extrudeBetween(scope, upperCS, partitionHeight, height + 2);

    solid = subtractAll(scope, wasm, solid, [...cavities, upperCavity]);

    const wallCutters = buildWallHoles(wasm, scope, params, clean, label);
    if (params.wall.enabled && wallCutters.length === 0) {
      warnings.push('当前壁面尺寸无法容纳所选孔洞，已跳过墙面打孔。');
    }
    try {
      solid = subtractAll(scope, wasm, solid, wallCutters);
    } catch (error) {
      console.warn('Wall pattern skipped', error);
      warnings.push('墙面孔洞与当前几何冲突，已跳过打孔。');
    }

    if (params.label.enabled && !label) {
      warnings.push('标签文字过长或尺寸不足，已跳过标签。');
    }
    const labelSolids = buildLabel(wasm, scope, clean, label);
    if (labelSolids.length > 0) {
      try {
        solid = scope.track(wasm.Manifold.union([solid, ...labelSolids]));
      } catch (error) {
        console.warn('Label geometry skipped', error);
        warnings.push('标签与当前几何冲突，已跳过标签。');
      }
    }

    const fingerPull = buildFingerPull(wasm, scope, params, clean);
    if (fingerPull) {
      try {
        solid = scope.track(solid.subtract(fingerPull));
      } catch (error) {
        console.warn('Finger pull skipped', error);
        warnings.push('手指扣与当前几何冲突，已跳过。');
      }
    }

    if (solid.isEmpty()) throw new Error('托盘几何为空，请调整尺寸或分区参数。');
    const mesh: PartMesh = solidToPartMeshLocal(solid);
    return {
      kind: 'tray',
      name: 'Tray',
      mesh,
      color: COLORS.tray,
      width,
      depth,
      height: height + (params.stackable ? 1 : 0),
    };
  } finally {
    scope.dispose();
  }
}

function solidToPartMeshLocal(solid: Solid): PartMesh {
  // Local to avoid deleting the mesh before all data is copied.
  return meshToPartMesh(solid.getMesh());
}

function buildBox(
  params: Params,
  clean: CleanParams,
  stackTotalHeight: number,
  wasm: ManifoldToplevel,
): PartInfo {
  const scope = new WasmScope();
  try {
    const { width, depth, fillet } = clean;
    const wall = Math.max(2.4, clean.thickness);
    const clearance = clamp(params.box.clearance, 0.2, 1.2);
    const outerWidth = width + 2 * (clearance + wall);
    const outerDepth = depth + 2 * (clearance + wall);
    const cavityWidth = width + 2 * clearance;
    const cavityDepth = depth + 2 * clearance;
    const outerFillet = Math.min(
      fillet + clearance + 0.8,
      Math.min(outerWidth, outerDepth) / 2 - 1,
    );
    const cavityFillet = Math.max(0.4, outerFillet - wall);
    const boxHeight = wall + stackTotalHeight + BOX_TOP_CLEARANCE;
    const segments = Math.max(4, Math.min(14, Math.ceil(outerFillet * 3)));

    const outerCS = scope.track(roundedRectCS(wasm, outerWidth, outerDepth, outerFillet, segments));
    let solid = scope.track(outerCS.extrude(boxHeight));

    const cavityCS = scope.track(roundedRectCS(wasm, cavityWidth, cavityDepth, cavityFillet, segments));
    const cavity = extrudeBetween(scope, cavityCS, wall, boxHeight + 1);
    solid = scope.track(solid.subtract(cavity));

    // Snap groove for the lid bead.
    const grooveOuter = scope.track(
      roundedRectCS(wasm, cavityWidth + 0.6, cavityDepth + 0.6, cavityFillet + 0.3, segments),
    );
    const grooveInner = scope.track(
      roundedRectCS(wasm, cavityWidth, cavityDepth, cavityFillet, segments),
    );
    const grooveRing = scope.track(grooveOuter.subtract(grooveInner));
    const grooveSolid = scope.track(grooveRing.extrude(1.1));
    const groove = scope.track(grooveSolid.translate([0, 0, boxHeight - 3.45]));
    solid = scope.track(solid.subtract(groove));

    if (solid.isEmpty()) throw new Error('收纳盒几何为空。');
    return {
      kind: 'box',
      name: 'Box',
      mesh: solidToPartMeshLocal(solid),
      color: COLORS.box,
      width: outerWidth,
      depth: outerDepth,
      height: boxHeight,
    };
  } finally {
    scope.dispose();
  }
}

function buildLid(
  params: Params,
  clean: CleanParams,
  wasm: ManifoldToplevel,
): PartInfo {
  const scope = new WasmScope();
  try {
    const { width, depth, fillet } = clean;
    const wall = Math.max(2.4, clean.thickness);
    const clearance = clamp(params.box.clearance, 0.2, 1.2);
    const outerWidth = width + 2 * (clearance + wall);
    const outerDepth = depth + 2 * (clearance + wall);
    const cavityWidth = width + 2 * clearance;
    const cavityDepth = depth + 2 * clearance;
    const outerFillet = Math.min(
      fillet + clearance + 0.8,
      Math.min(outerWidth, outerDepth) / 2 - 1,
    );
    const plugWidth = cavityWidth - 0.4;
    const plugDepth = cavityDepth - 0.4;
    const plugFillet = Math.max(0.4, outerFillet - wall - 0.2);
    const skirt = Math.max(1.6, Math.min(wall, plugWidth / 4, plugDepth / 4));
    const plateHeight = 2.6;
    const plugHeight = 5.2;
    const segments = Math.max(4, Math.min(14, Math.ceil(outerFillet * 3)));

    const plateCS = scope.track(roundedRectCS(wasm, outerWidth, outerDepth, outerFillet, segments));
    let solid = scope.track(plateCS.extrude(plateHeight));

    const plugOuterCS = scope.track(roundedRectCS(wasm, plugWidth, plugDepth, plugFillet, segments));
    const plugInnerCS = scope.track(
      roundedRectCS(
        wasm,
        Math.max(4, plugWidth - skirt * 2),
        Math.max(4, plugDepth - skirt * 2),
        Math.max(0.3, plugFillet - skirt),
        segments,
      ),
    );
    const plugRingCS = scope.track(plugOuterCS.subtract(plugInnerCS));
    const plugSolid = scope.track(plugRingCS.extrude(plugHeight));
    const plug = scope.track(plugSolid.translate([0, 0, plateHeight]));
    solid = scope.track(wasm.Manifold.union([solid, plug]));

    const beadOuter = scope.track(
      roundedRectCS(wasm, plugWidth + 0.9, plugDepth + 0.9, plugFillet + 0.45, segments),
    );
    const beadInner = scope.track(
      roundedRectCS(wasm, plugWidth, plugDepth, plugFillet, segments),
    );
    const beadRing = scope.track(beadOuter.subtract(beadInner));
    const beadSolid = scope.track(beadRing.extrude(1));
    const bead = scope.track(beadSolid.translate([0, 0, plateHeight + 2.4]));
    solid = scope.track(wasm.Manifold.union([solid, bead]));

    const scoopCircle = scope.track(
      wasm.CrossSection.circle(Math.min(9, outerDepth / 2 - 1), 32),
    );
    const scoopSolid = scope.track(scoopCircle.extrude(plateHeight + 0.1));
    const scoop = scope.track(scoopSolid.translate([0, 0, -0.5]));
    const scoopPlaced = scope.track(scoop.translate([0, -outerDepth / 2, 0]));
    solid = scope.track(solid.subtract(scoopPlaced));

    if (solid.isEmpty()) throw new Error('盖子几何为空。');
    return {
      kind: 'lid',
      name: 'Lid',
      mesh: solidToPartMeshLocal(solid),
      color: COLORS.lid,
      width: outerWidth,
      depth: outerDepth,
      height: plateHeight + plugHeight,
    };
  } finally {
    scope.dispose();
  }
}

export async function buildModel(
  params: Params,
  grid: GridState,
  mode: AppMode,
): Promise<BuildResult> {
  const start = performance.now();
  const wasm = await getManifoldModule();
  const { clean, warnings } = sanitize(params);
  const label = buildLabelLayout(params, clean);
  const parts: PartInfo[] = [];
  let tray: PartInfo | null = null;
  let box: PartInfo | null = null;
  let lid: PartInfo | null = null;

  const cellSizes = layoutCells(grid, clean.width, clean.depth, clean.thickness);
  if (cellSizes.some((cell) => cell.x1 - cell.x0 < 3 || cell.y1 - cell.y0 < 3)) {
    warnings.push('部分单元格小于 3 mm，建议减少行数/列数或增大托盘尺寸。');
  }

  try {
    tray = buildTray(wasm, params, grid, clean, label, warnings);
    parts.push(tray);
  } catch (error) {
    console.error(error);
    warnings.push(`托盘生成失败：${(error as Error).message}`);
  }

  const stackTotalHeight =
    clean.height * params.box.trayCount + (params.stackable ? 1 : 0);

  if (tray && mode === 'set') {
    try {
      box = buildBox(params, clean, stackTotalHeight, wasm);
      parts.push(box);
    } catch (error) {
      console.error(error);
      warnings.push(`收纳盒生成失败：${(error as Error).message}`);
    }
    if (params.box.lid) {
      try {
        lid = buildLid(params, clean, wasm);
        parts.push(lid);
      } catch (error) {
        console.error(error);
        warnings.push(`盖子生成失败：${(error as Error).message}`);
      }
    }
  }

  const durationMs = performance.now() - start;
  return {
    parts,
    tray,
    box,
    lid,
    trayTotalHeight: clean.height + (params.stackable ? 1 : 0),
    stackTotalHeight,
    warnings,
    durationMs,
  };
}

export function suggestPartCount(params: Params): number {
  return 1 + (params.box.lid ? 2 : 1);
}

export function describeCell(cell: { x0: number; y0: number; x1: number; y1: number }) {
  return `${round(cell.x1 - cell.x0, 1)} × ${round(cell.y1 - cell.y0, 1)} mm`;
}

export function cellSpanSummary(grid: GridState) {
  return `${grid.cols.length} 列 × ${grid.rows.length} 行 · ${grid.merges.length} 个合并格`;
}
