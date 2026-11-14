import { create } from 'zustand';
import {
  DEFAULT_GRID,
  DEFAULT_PARAMS,
  LIMITS,
  clamp,
  type AppMode,
  type BoxOptions,
  type FingerPullOptions,
  type GridState,
  type LabelOptions,
  type Params,
  type ViewTab,
  type WallOptions,
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
  return {
    ...params,
    width,
    depth,
    height,
    thickness,
    fillet,
    partitionHeight,
    wall: { ...params.wall, holeSize },
    fingerPull: { ...params.fingerPull, width: fingerWidth, height: fingerHeight },
    box: {
      ...params.box,
      trayCount: Math.round(clamp(params.box.trayCount, LIMITS.trayCount[0], LIMITS.trayCount[1])),
      clearance: clamp(params.box.clearance, LIMITS.clearance[0], LIMITS.clearance[1]),
    },
  };
};

interface AppState {
  mode: AppMode;
  tab: ViewTab;
  params: Params;
  grid: GridState;
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
}

export const useAppStore = create<AppState>((set) => ({
  mode: 'tray',
  tab: 'size',
  params: DEFAULT_PARAMS,
  grid: DEFAULT_GRID,
  explode: 0.35,
  selectedCells: [],
  setMode: (mode) => set({ mode }),
  setTab: (tab) => set({ tab }),
  setExplode: (value) => set({ explode: clamp(value, 0, 1) }),
  reset: () =>
    set({
      params: DEFAULT_PARAMS,
      grid: DEFAULT_GRID,
      selectedCells: [],
      explode: 0.35,
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
  setGrid: (grid) => set({ grid: sanitizeGrid(grid) }),
  setPreset: (cols, rows) =>
    set({ grid: evenGrid(cols, rows), selectedCells: [] }),
  addGridColumn: () =>
    set((state) => ({ grid: addColumn(state.grid), selectedCells: [] })),
  addGridRow: () =>
    set((state) => ({ grid: addRow(state.grid), selectedCells: [] })),
  removeGridColumnBoundary: (boundary) =>
    set((state) => ({
      grid: removeColumnBoundary(state.grid, boundary),
      selectedCells: [],
    })),
  removeGridRowBoundary: (boundary) =>
    set((state) => ({
      grid: removeRowBoundary(state.grid, boundary),
      selectedCells: [],
    })),
  mergeSelectedCells: (cells) =>
    set((state) => ({ grid: mergeCells(state.grid, cells), selectedCells: [] })),
  splitGridCell: (cell) =>
    set((state) => ({ grid: splitCell(state.grid, cell), selectedCells: [] })),
  setSelectedCells: (ids) => set({ selectedCells: ids }),
}));
