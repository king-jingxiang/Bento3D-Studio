export type HoleShape = 'hexagon' | 'circle';
export type MarginPreset = 'dense' | 'normal' | 'relaxed';
export type AppMode = 'tray' | 'set' | 'organizer' | 'zones';
export type ViewTab = 'size' | 'grid' | 'preview';
export type OutlineShape = 'rect' | 'rounded' | 'ellipse' | 'hexagon' | 'octagon' | 'capsule';
export type LayerAlign = 'back' | 'center';

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

export interface ChamferOptions {
  enabled: boolean;
  size: number;
}

export interface Params {
  width: number;
  depth: number;
  height: number;
  thickness: number;
  fillet: number;
  partitionHeight: number;
  stackable: boolean;
  chamfer: ChamferOptions;
  wall: WallOptions;
  label: LabelOptions;
  fingerPull: FingerPullOptions;
  box: BoxOptions;
}

export interface LayerConfig {
  id: string;
  name: string;
  /** Layer depth (front-to-back), mm. */
  depth: number;
  /** Layer height, mm. */
  height: number;
  shape: OutlineShape;
  grid: GridState;
}

export interface OrganizerConfig {
  /** Layers ordered bottom → top. */
  layers: LayerConfig[];
  align: LayerAlign;
  /** How far dividers sit below the outer rim, mm. */
  dividerInset: number;
}

export type ZoneShape = 'rect' | 'rounded' | 'circle' | 'ellipse' | 'hexagon' | 'capsule';

export interface ZoneStyle {
  /** Total zone height measured from the table, mm. */
  height: number;
  /** Inner cavity profile. */
  shape: ZoneShape;
}

export interface ZonesConfig {
  /** Overall footprint outline. */
  outline: OutlineShape;
  defaultHeight: number;
  defaultShape: ZoneShape;
  /** Per-zone styles keyed by the top-left base-grid anchor `row-col`. */
  styles: Record<string, ZoneStyle>;
}

export interface Offset3 {
  x: number;
  y: number;
  z: number;
}

export interface PartMesh {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

export interface PartInfo {
  kind: 'tray' | 'box' | 'lid' | 'layer' | 'zone';
  name: string;
  mesh: PartMesh;
  color: string;
  width: number;
  depth: number;
  height: number;
  /** Placement in model space, used by the viewport only (ignored on export). */
  offset?: Offset3;
  layerIndex?: number;
}

export interface BuildResult {
  parts: PartInfo[];
  tray: PartInfo | null;
  box: PartInfo | null;
  lid: PartInfo | null;
  layers: PartInfo[];
  /** Integrated one-piece body for the zones mode. */
  zoneBody: PartInfo | null;
  /** Per-zone printable parts (each with its own floor). */
  zoneParts: PartInfo[];
  zonesTotalHeight: number;
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
  chamfer: {
    enabled: false,
    size: 0.8,
  },
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

export const OUTLINE_SHAPES: OutlineShape[] = [
  'rect',
  'rounded',
  'ellipse',
  'hexagon',
  'octagon',
  'capsule',
];

export const OUTLINE_SHAPE_LABELS: Record<OutlineShape, string> = {
  rect: '方形',
  rounded: '圆角',
  ellipse: '椭圆',
  hexagon: '六边形',
  octagon: '八边形',
  capsule: '胶囊形',
};

export const APP_MODE_LABELS: Record<AppMode, string> = {
  tray: '托盘',
  set: '托盘 + 收纳盒',
  organizer: '多层收纳盒',
  zones: '分区一体盒',
};

export const ZONE_SHAPES: ZoneShape[] = [
  'rect',
  'rounded',
  'circle',
  'ellipse',
  'hexagon',
  'capsule',
];

export const ZONE_SHAPE_LABELS: Record<ZoneShape, string> = {
  rect: '矩形',
  rounded: '圆角矩形',
  circle: '圆形',
  ellipse: '椭圆',
  hexagon: '六边形',
  capsule: '胶囊形',
};

function evenGridState(cols: number, rows: number): GridState {
  return {
    cols: Array.from({ length: cols }, () => 1 / cols),
    rows: Array.from({ length: rows }, () => 1 / rows),
    merges: [],
  };
}

export const DEFAULT_ORGANIZER: OrganizerConfig = {
  align: 'back',
  dividerInset: 2,
  layers: [
    {
      id: 'layer-1',
      name: '第 1 层',
      depth: 130,
      height: 30,
      shape: 'rounded',
      grid: evenGridState(2, 2),
    },
    {
      id: 'layer-2',
      name: '第 2 层',
      depth: 95,
      height: 24,
      shape: 'rounded',
      grid: evenGridState(3, 1),
    },
    {
      id: 'layer-3',
      name: '第 3 层',
      depth: 60,
      height: 20,
      shape: 'rounded',
      grid: evenGridState(1, 2),
    },
  ],
};

export const DEFAULT_ZONES: ZonesConfig = {
  outline: 'rounded',
  defaultHeight: 34,
  defaultShape: 'rounded',
  styles: {},
};

export const LIMITS = {
  width: [40, 300] as [number, number],
  depth: [40, 300] as [number, number],
  height: [8, 120] as [number, number],
  thickness: [1, 5] as [number, number],
  fillet: [0, 8] as [number, number],
  chamfer: [0.2, 2] as [number, number],
  partitionHeight: [4, 120] as [number, number],
  holeSize: [3, 12] as [number, number],
  labelWidth: [20, 120] as [number, number],
  fingerWidth: [10, 80] as [number, number],
  fingerHeight: [6, 30] as [number, number],
  trayCount: [1, 6] as [number, number],
  clearance: [0.2, 1.2] as [number, number],
  explode: [0, 1] as [number, number],
  layerCount: [1, 6] as [number, number],
  layerDepth: [40, 300] as [number, number],
  layerHeight: [8, 150] as [number, number],
  zoneHeight: [8, 150] as [number, number],
  dividerInset: [0, 8] as [number, number],
};

export function isOutlineShape(value: unknown): value is OutlineShape {
  return typeof value === 'string' && OUTLINE_SHAPES.includes(value as OutlineShape);
}

export function isAppMode(value: unknown): value is AppMode {
  return value === 'tray' || value === 'set' || value === 'organizer' || value === 'zones';
}

export function isZoneShape(value: unknown): value is ZoneShape {
  return typeof value === 'string' && ZONE_SHAPES.includes(value as ZoneShape);
}


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
