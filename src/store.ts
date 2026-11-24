import { create } from 'zustand';
import {
  DEFAULT_GRID,
  DEFAULT_LAYER_WALL,
  DEFAULT_ORGANIZER,
  DEFAULT_PARAMS,
  DEFAULT_ZONES,
  DEFAULT_ZONES_GRID,
  LIMITS,
  clamp,
  isOutlineShape,
  type AppMode,
  type BoxOptions,
  type ChamferOptions,
  type FingerPullOptions,
  type GridState,
  type LabelOptions,
  type LayerConfig,
  type OrganizerConfig,
  type Params,
  type ViewTab,
  type WallOptions,
  type ZoneStyle,
  type ZonesConfig,
} from './types';
import {
  addColumn,
  addRow,
  evenGrid,
  mergeCells,
  removeColumnBoundary,
  removeRowBoundary,
  sanitizeGrid,
  splitCell,
  type ResolvedCell,
} from './lib/grid';
import { sanitizeOrganizer } from './lib/organizer';
import { sanitizeZones, zoneAnchor, zoneStyleFor } from './lib/zones';
import type { BentoConfig } from './lib/config';

const clampParams = (params: Params): Params => {
  const width = clamp(params.width, LIMITS.width[0], LIMITS.width[1]);
  const depth = clamp(params.depth, LIMITS.depth[0], LIMITS.depth[1]);
  const height = clamp(params.height, LIMITS.height[0], LIMITS.height[1]);
  const thickness = clamp(
    params.thickness,
    LIMITS.thickness[0],
    Math.min(LIMITS.thickness[1], Math.min(width, depth) / 6),
  );
  const fillet = clamp(
    params.fillet,
    0,
    Math.min(LIMITS.fillet[1], Math.min(width, depth) / 2 - thickness - 0.5),
  );
  const partitionHeight = clamp(
    params.partitionHeight,
    thickness + 1,
    Math.max(thickness + 1.5, height - 0.6),
  );
  const holeSize = clamp(
    params.wall.holeSize,
    LIMITS.holeSize[0],
    Math.min(LIMITS.holeSize[1], Math.max(LIMITS.holeSize[0], height - 7)),
  );
  const fingerWidth = clamp(
    params.fingerPull.width,
    LIMITS.fingerWidth[0],
    Math.min(LIMITS.fingerWidth[1], Math.max(12, width - 12)),
  );
  const fingerHeight = clamp(
    params.fingerPull.height,
    LIMITS.fingerHeight[0],
    Math.min(LIMITS.fingerHeight[1], Math.max(7, height - 2)),
  );
  const chamferSize = clamp(
    params.chamfer.size,
    LIMITS.chamfer[0],
    Math.min(LIMITS.chamfer[1], Math.max(LIMITS.chamfer[0], thickness * 0.6)),
  );
  return {
    ...params,
    width,
    depth,
    height,
    thickness,
    fillet,
    partitionHeight,
    chamfer: { ...params.chamfer, size: chamferSize },
    wall: { ...params.wall, holeSize },
    fingerPull: { ...params.fingerPull, width: fingerWidth, height: fingerHeight },
    box: {
      ...params.box,
      trayCount: Math.round(clamp(params.box.trayCount, LIMITS.trayCount[0], LIMITS.trayCount[1])),
      clearance: clamp(params.box.clearance, LIMITS.clearance[0], LIMITS.clearance[1]),
    },
  };
};

const clampLayer = (layer: LayerConfig): LayerConfig => ({
  ...layer,
  name: (layer.name ?? '').slice(0, 24),
  depth: clamp(layer.depth, LIMITS.layerDepth[0], LIMITS.layerDepth[1]),
  height: clamp(layer.height, LIMITS.layerHeight[0], LIMITS.layerHeight[1]),
  shape: isOutlineShape(layer.shape) ? layer.shape : 'rounded',
  grid: sanitizeGrid(layer.grid),
  stackable: layer.stackable === true,
  wall: {
    enabled: layer.wall?.enabled === true,
    shape: layer.wall?.shape === 'circle' ? 'circle' : 'hexagon',
    holeSize: clamp(
      Number(layer.wall?.holeSize) || DEFAULT_LAYER_WALL.holeSize,
      LIMITS.holeSize[0],
      LIMITS.holeSize[1],
    ),
    margin:
      layer.wall?.margin === 'dense' || layer.wall?.margin === 'relaxed'
        ? layer.wall.margin
        : 'normal',
  },
});

/** Shift zone anchors when a grid divider is removed (cells right of it collapse left). */
function remapZoneAnchors(
  zones: ZonesConfig,
  axis: 'row' | 'col',
  boundary: number,
): ZonesConfig {
  const entries = Object.entries(zones.styles)
    .map(([key, style]) => {
      const [row, col] = key.split('-').map(Number);
      return { row, col, style };
    })
    .filter(({ row, col }) => Number.isFinite(row) && Number.isFinite(col))
    .sort((a, b) =>
      axis === 'col' ? a.col - b.col || a.row - b.row : a.row - b.row || a.col - b.col,
    );

  const styles: Record<string, ZoneStyle> = {};
  for (const { row, col, style } of entries) {
    const nextRow = axis === 'row' && row >= boundary ? row - 1 : row;
    const nextCol = axis === 'col' && col >= boundary ? col - 1 : col;
    const key = zoneAnchor(nextRow, nextCol);
    // The cell on the left/top owns the anchor when two columns/rows merge.
    if (!(key in styles)) styles[key] = style;
  }
  return { ...zones, styles };
}

interface AppState {
  mode: AppMode;
  tab: ViewTab;
  params: Params;
  grid: GridState;
  /** Independent partition layout for the integrated zones box. */
  zonesGrid: GridState;
  organizer: OrganizerConfig;
  zones: ZonesConfig;
  activeLayerId: string;
  explode: number;
  selectedCells: string[];
  setMode: (mode: AppMode) => void;
  setTab: (tab: ViewTab) => void;
  setExplode: (value: number) => void;
  reset: () => void;
  setSize: (axis: 'width' | 'depth' | 'height', value: number) => void;
  setThickness: (value: number) => void;
  setFillet: (value: number) => void;
  setPartitionHeight: (value: number) => void;
  setStackable: (value: boolean) => void;
  updateChamfer: (patch: Partial<ChamferOptions>) => void;
  updateWall: (patch: Partial<WallOptions>) => void;
  updateLabel: (patch: Partial<LabelOptions>) => void;
  updateFingerPull: (patch: Partial<FingerPullOptions>) => void;
  updateBox: (patch: Partial<BoxOptions>) => void;
  setGrid: (grid: GridState) => void;
  setPreset: (cols: number, rows: number) => void;
  addGridColumn: () => void;
  addGridRow: () => void;
  removeGridColumnBoundary: (boundary: number) => void;
  removeGridRowBoundary: (boundary: number) => void;
  mergeSelectedCells: (cells: ResolvedCell[]) => void;
  splitGridCell: (cell: ResolvedCell) => void;
  setSelectedCells: (ids: string[]) => void;
  setActiveLayer: (id: string) => void;
  addOrganizerLayer: () => void;
  removeOrganizerLayer: (id: string) => void;
  moveOrganizerLayer: (id: string, direction: -1 | 1) => void;
  updateOrganizerLayer: (
    id: string,
    patch: Partial<
      Pick<LayerConfig, 'name' | 'depth' | 'height' | 'shape' | 'grid' | 'stackable' | 'wall'>
    >,
  ) => void;
  updateOrganizer: (patch: Partial<Pick<OrganizerConfig, 'align' | 'dividerInset'>>) => void;
  updateZones: (
    patch: Partial<Pick<ZonesConfig, 'outline' | 'defaultHeight' | 'defaultShape'>>,
  ) => void;
  updateZoneStyle: (anchor: string, patch: Partial<ZoneStyle>) => void;
  applyConfig: (config: BentoConfig) => void;
}

function activeLayer(state: AppState): LayerConfig {
  return (
    state.organizer.layers.find((layer) => layer.id === state.activeLayerId) ??
    state.organizer.layers[0]
  );
}

function currentGrid(state: AppState): GridState {
  if (state.mode === 'organizer') return activeLayer(state).grid;
  if (state.mode === 'zones') return state.zonesGrid;
  return state.grid;
}

function routeGrid(
  state: AppState,
  next: GridState,
  clearSelection: boolean,
): Partial<AppState> {
  const grid = sanitizeGrid(next);
  const base = clearSelection ? { selectedCells: [] as string[] } : {};
  if (state.mode === 'organizer') {
    const id = activeLayer(state).id;
    return {
      ...base,
      organizer: {
        ...state.organizer,
        layers: state.organizer.layers.map((layer) =>
          layer.id === id ? { ...layer, grid } : layer,
        ),
      },
    };
  }
  if (state.mode === 'zones') return { ...base, zonesGrid: grid };
  return { ...base, grid };
}

const initialOrganizer = sanitizeOrganizer(DEFAULT_ORGANIZER);

export const useAppStore = create<AppState>((set) => ({
  mode: 'tray',
  tab: 'size',
  params: DEFAULT_PARAMS,
  grid: DEFAULT_GRID,
  zonesGrid: sanitizeGrid(DEFAULT_ZONES_GRID),
  organizer: initialOrganizer,
  zones: sanitizeZones(DEFAULT_ZONES),
  activeLayerId: initialOrganizer.layers[0].id,
  explode: 0.35,
  selectedCells: [],
  setMode: (mode) => set({ mode, selectedCells: [] }),
  setTab: (tab) => set({ tab }),
  setExplode: (value) => set({ explode: clamp(value, 0, 1) }),
  reset: () =>
    set(() => {
      const organizer = sanitizeOrganizer(DEFAULT_ORGANIZER);
      return {
        params: DEFAULT_PARAMS,
        grid: DEFAULT_GRID,
        zonesGrid: sanitizeGrid(DEFAULT_ZONES_GRID),
        organizer,
        zones: sanitizeZones(DEFAULT_ZONES),
        activeLayerId: organizer.layers[0].id,
        selectedCells: [],
        explode: 0.35,
      };
    }),
  setSize: (axis, value) =>
    set((state) => {
      const limits =
        axis === 'width' ? LIMITS.width : axis === 'depth' ? LIMITS.depth : LIMITS.height;
      const next = { ...state.params, [axis]: clamp(value, limits[0], limits[1]) } as Params;
      if (axis === 'height') {
        next.partitionHeight = clamp(
          next.height - next.thickness * 2,
          next.thickness + 1,
          next.height - 0.6,
        );
      }
      return { params: clampParams(next) };
    }),
  setThickness: (value) =>
    set((state) => ({ params: clampParams({ ...state.params, thickness: value }) })),
  setFillet: (value) =>
    set((state) => ({ params: clampParams({ ...state.params, fillet: value }) })),
  setPartitionHeight: (value) =>
    set((state) => ({ params: clampParams({ ...state.params, partitionHeight: value }) })),
  setStackable: (value) =>
    set((state) => ({ params: clampParams({ ...state.params, stackable: value }) })),
  updateChamfer: (patch) =>
    set((state) => ({
      params: clampParams({ ...state.params, chamfer: { ...state.params.chamfer, ...patch } }),
    })),
  updateWall: (patch) =>
    set((state) => ({
      params: clampParams({ ...state.params, wall: { ...state.params.wall, ...patch } }),
    })),
  updateLabel: (patch) =>
    set((state) => ({
      params: clampParams({ ...state.params, label: { ...state.params.label, ...patch } }),
    })),
  updateFingerPull: (patch) =>
    set((state) => ({
      params: clampParams({
        ...state.params,
        fingerPull: { ...state.params.fingerPull, ...patch },
      }),
    })),
  updateBox: (patch) =>
    set((state) => ({
      params: clampParams({ ...state.params, box: { ...state.params.box, ...patch } }),
    })),
  setGrid: (grid) => set((state) => routeGrid(state, grid, false)),
  setPreset: (cols, rows) => set((state) => routeGrid(state, evenGrid(cols, rows), true)),
  addGridColumn: () => set((state) => routeGrid(state, addColumn(currentGrid(state)), true)),
  addGridRow: () => set((state) => routeGrid(state, addRow(currentGrid(state)), true)),
  removeGridColumnBoundary: (boundary) =>
    set((state) => {
      const routed = routeGrid(
        state,
        removeColumnBoundary(currentGrid(state), boundary),
        true,
      );
      return state.mode === 'zones'
        ? { ...routed, zones: remapZoneAnchors(state.zones, 'col', boundary) }
        : routed;
    }),
  removeGridRowBoundary: (boundary) =>
    set((state) => {
      const routed = routeGrid(state, removeRowBoundary(currentGrid(state), boundary), true);
      return state.mode === 'zones'
        ? { ...routed, zones: remapZoneAnchors(state.zones, 'row', boundary) }
        : routed;
    }),
  mergeSelectedCells: (cells) =>
    set((state) => routeGrid(state, mergeCells(currentGrid(state), cells), true)),
  splitGridCell: (cell) =>
    set((state) => {
      const routed = routeGrid(state, splitCell(currentGrid(state), cell), true);
      if (state.mode !== 'zones') return routed;

      // Copy the merged zone's style onto every cell it is split into.
      const style = zoneStyleFor(cell, state.zones);
      const styles = { ...state.zones.styles };
      for (let row = cell.r0; row <= cell.r1; row += 1) {
        for (let col = cell.c0; col <= cell.c1; col += 1) {
          styles[zoneAnchor(row, col)] = style;
        }
      }
      return { ...routed, zones: sanitizeZones({ ...state.zones, styles }) };
    }),
  setSelectedCells: (ids) => set({ selectedCells: ids }),
  setActiveLayer: (id) =>
    set((state) =>
      state.organizer.layers.some((layer) => layer.id === id)
        ? { activeLayerId: id, selectedCells: [] }
        : {},
    ),
  addOrganizerLayer: () =>
    set((state) => {
      const layers = state.organizer.layers;
      if (layers.length >= LIMITS.layerCount[1]) return {};
      const last = layers[layers.length - 1];
      const id = `layer-${Date.now().toString(36)}-${layers.length + 1}`;
      const layer: LayerConfig = clampLayer({
        id,
        name: `第 ${layers.length + 1} 层`,
        depth: Math.round((last?.depth ?? 100) * 0.78),
        height: last?.height ?? 24,
        shape: last?.shape ?? 'rounded',
        grid: evenGrid(1, 1),
        stackable: last?.stackable ?? false,
        wall: { ...(last?.wall ?? DEFAULT_LAYER_WALL) },
      });
      return {
        organizer: { ...state.organizer, layers: [...layers, layer] },
        activeLayerId: id,
        selectedCells: [],
      };
    }),
  removeOrganizerLayer: (id) =>
    set((state) => {
      const layers = state.organizer.layers;
      if (layers.length <= LIMITS.layerCount[0]) return {};
      const index = layers.findIndex((layer) => layer.id === id);
      if (index < 0) return {};
      const remaining = layers.filter((layer) => layer.id !== id);
      const nextActive =
        state.activeLayerId === id
          ? remaining[Math.min(index, remaining.length - 1)].id
          : state.activeLayerId;
      return {
        organizer: { ...state.organizer, layers: remaining },
        activeLayerId: nextActive,
        selectedCells: [],
      };
    }),
  moveOrganizerLayer: (id, direction) =>
    set((state) => {
      const layers = [...state.organizer.layers];
      const index = layers.findIndex((layer) => layer.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= layers.length) return {};
      const [item] = layers.splice(index, 1);
      layers.splice(target, 0, item);
      return { organizer: { ...state.organizer, layers } };
    }),
  updateOrganizerLayer: (id, patch) =>
    set((state) => ({
      organizer: {
        ...state.organizer,
        layers: state.organizer.layers.map((layer) =>
          layer.id === id ? clampLayer({ ...layer, ...patch }) : layer,
        ),
      },
    })),
  updateOrganizer: (patch) =>
    set((state) => ({
      organizer: {
        ...state.organizer,
        ...patch,
        dividerInset:
          patch.dividerInset === undefined
            ? state.organizer.dividerInset
            : clamp(patch.dividerInset, LIMITS.dividerInset[0], LIMITS.dividerInset[1]),
      },
    })),
  updateZones: (patch) =>
    set((state) => ({ zones: sanitizeZones({ ...state.zones, ...patch }) })),
  updateZoneStyle: (anchor, patch) =>
    set((state) => {
      const current = state.zones.styles[anchor] ?? {
        height: state.zones.defaultHeight,
        shape: state.zones.defaultShape,
      };
      return {
        zones: sanitizeZones({
          ...state.zones,
          styles: { ...state.zones.styles, [anchor]: { ...current, ...patch } },
        }),
      };
    }),
  applyConfig: (config) =>
    set(() => {
      const organizer = sanitizeOrganizer(config.organizer);
      return {
        mode: config.mode,
        params: clampParams(config.params),
        grid: sanitizeGrid(config.grid),
        zonesGrid: sanitizeGrid(config.zonesGrid),
        organizer,
        zones: sanitizeZones(config.zones),
        activeLayerId: organizer.layers[0].id,
        selectedCells: [],
        explode: 0.35,
      };
    }),
}));
