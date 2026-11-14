export type HoleShape = 'hexagon' | 'circle';
export type MarginPreset = 'dense' | 'normal' | 'relaxed';
export type AppMode = 'tray' | 'set';
export type ViewTab = 'size' | 'grid' | 'preview';

export interface CellRect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export interface GridState {
  /** Column fractions of the inner cavity. Length = number of columns, sums to 1. */
  cols: number[];
  /** Row fractions of the inner cavity. Length = number of rows, sums to 1. */
  rows: number[];
  /** Inclusive rectangles of merged cells. */
  merges: CellRect[];
}

export interface WallOptions {
  enabled: boolean;
  shape: HoleShape;
  holeSize: number;
  margin: MarginPreset;
}

export interface LabelOptions {
  enabled: boolean;
  text: string;
}

export interface FingerPullOptions {
  enabled: boolean;
  width: number;
  height: number;
}

export interface BoxOptions {
  trayCount: number;
  clearance: number;
  lid: boolean;
}

export interface Params {
  width: number;
  depth: number;
  height: number;
  thickness: number;
  fillet: number;
  partitionHeight: number;
  stackable: boolean;
  wall: WallOptions;
  label: LabelOptions;
  fingerPull: FingerPullOptions;
  box: BoxOptions;
}

export interface PartMesh {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

export interface PartInfo {
  kind: 'tray' | 'box' | 'lid';
  name: string;
  mesh: PartMesh;
  color: string;
  width: number;
  depth: number;
  height: number;
}

export interface BuildResult {
  parts: PartInfo[];
  tray: PartInfo | null;
  box: PartInfo | null;
  lid: PartInfo | null;
  trayTotalHeight: number;
  stackTotalHeight: number;
  warnings: string[];
  durationMs: number;
}

export const HOLE_MARGIN: Record<MarginPreset, number> = {
  dense: 1.5,
  normal: 3,
  relaxed: 5,
};

export const DEFAULT_GRID: GridState = {
  cols: [1],
  rows: [1],
  merges: [],
};

export const DEFAULT_PARAMS: Params = {
  width: 100,
  depth: 100,
  height: 20,
  thickness: 2,
  fillet: 2,
  partitionHeight: 16,
  stackable: false,
  wall: {
    enabled: false,
    shape: 'hexagon',
    holeSize: 3,
    margin: 'normal',
  },
  label: {
    enabled: false,
    text: 'BENTO',
  },
  fingerPull: {
    enabled: false,
    width: 20,
    height: 10,
  },
  box: {
    trayCount: 1,
    clearance: 0.4,
    lid: true,
  },
};

export const LIMITS = {
  width: [40, 300] as [number, number],
  depth: [40, 300] as [number, number],
  height: [8, 120] as [number, number],
  thickness: [1, 5] as [number, number],
  fillet: [0, 8] as [number, number],
  partitionHeight: [4, 120] as [number, number],
  holeSize: [3, 12] as [number, number],
  labelWidth: [20, 120] as [number, number],
  fingerWidth: [10, 80] as [number, number],
  fingerHeight: [6, 30] as [number, number],
  trayCount: [1, 6] as [number, number],
  clearance: [0.2, 1.2] as [number, number],
  explode: [0, 1] as [number, number],
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatMm(value: number) {
  return `${round(value, 1)} mm`;
}
