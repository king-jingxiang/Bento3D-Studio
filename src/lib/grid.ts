import type { CellRect, GridState } from '../types';

export interface ResolvedCell extends CellRect {
  id: string;
}

export interface LaidOutCell extends ResolvedCell {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const MIN_FRACTION = 0.05;
export const MAX_DIVISIONS = 12;

export function cumulative(fractions: number[]): number[] {
  const bounds = [0];
  let total = 0;
  for (const value of fractions) {
    total += value;
    bounds.push(total);
  }
  return bounds;
}

export function evenGrid(cols: number, rows: number): GridState {
  return {
    cols: Array.from({ length: cols }, () => 1 / cols),
    rows: Array.from({ length: rows }, () => 1 / rows),
    merges: [],
  };
}

export function clampRect(rect: CellRect, rowCount: number, colCount: number): CellRect | null {
  const r0 = Math.max(0, Math.min(rect.r0, rect.r1));
  const r1 = Math.min(rowCount - 1, Math.max(rect.r0, rect.r1));
  const c0 = Math.max(0, Math.min(rect.c0, rect.c1));
  const c1 = Math.min(colCount - 1, Math.max(rect.c0, rect.c1));
  if (r0 > r1 || c0 > c1) return null;
  return { r0, c0, r1, c1 };
}

/** Resolve the grid into a list of cells, applying the merged rectangles. */
export function resolveCells(grid: GridState): ResolvedCell[] {
  const rows = grid.rows.length;
  const cols = grid.cols.length;
  const owner: (string | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );
  const cells: ResolvedCell[] = [];

  grid.merges.forEach((merge, index) => {
    const rect = clampRect(merge, rows, cols);
    if (!rect) return;
    if (rect.r0 === rect.r1 && rect.c0 === rect.c1) return;
    const id = `m${index}`;
    cells.push({ ...rect, id });
    for (let r = rect.r0; r <= rect.r1; r += 1) {
      for (let c = rect.c0; c <= rect.c1; c += 1) {
        owner[r][c] = id;
      }
    }
  });

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (owner[r][c] === null) {
        cells.push({ r0: r, c0: c, r1: r, c1: c, id: `c${r}-${c}` });
      }
    }
  }

  return cells;
}

export function cellAt(grid: GridState, row: number, col: number): ResolvedCell | null {
  return (
    resolveCells(grid).find(
      (cell) => row >= cell.r0 && row <= cell.r1 && col >= cell.c0 && col <= cell.c1,
    ) ?? null
  );
}

export function layoutCells(
  grid: GridState,
  width: number,
  depth: number,
  thickness: number,
): LaidOutCell[] {
  const colBounds = cumulative(grid.cols);
  const rowBounds = cumulative(grid.rows);
  const innerW = width - thickness * 2;
  const innerD = depth - thickness * 2;
  const colCount = grid.cols.length;
  const rowCount = grid.rows.length;
  const x0 = -width / 2 + thickness;
  const y0 = -depth / 2 + thickness;

  return resolveCells(grid).map((cell) => ({
    ...cell,
    x0: x0 + colBounds[cell.c0] * innerW + (cell.c0 > 0 ? thickness / 2 : 0),
    x1: x0 + colBounds[cell.c1 + 1] * innerW - (cell.c1 < colCount - 1 ? thickness / 2 : 0),
    y0: y0 + rowBounds[cell.r0] * innerD + (cell.r0 > 0 ? thickness / 2 : 0),
    y1: y0 + rowBounds[cell.r1 + 1] * innerD - (cell.r1 < rowCount - 1 ? thickness / 2 : 0),
  }));
}

/** Move an internal column/row boundary. Index is 1..n-1. */
export function moveBoundary(fractions: number[], index: number, target: number): number[] {
  if (index <= 0 || index >= fractions.length) return fractions;
  const min = MIN_FRACTION;
  const lower = fractions
    .slice(0, index - 1)
    .reduce((sum, value) => sum + value, 0);
  const upper = fractions
    .slice(index + 1)
    .reduce((sum, value) => sum + value, 0);
  const minPos = lower + min;
  const maxPos = 1 - upper - min;
  const position = Math.min(Math.max(target, minPos), Math.max(minPos, maxPos));
  const before = fractions.slice(0, index).reduce((sum, value) => sum + value, 0);
  const after = fractions.slice(index).reduce((sum, value) => sum + value, 0);
  const delta = position - before;

  const next = [...fractions];
  if (delta >= 0) {
    next[index - 1] += delta;
    next[index] -= delta;
  } else {
    next[index - 1] += delta;
    next[index] -= delta;
  }
  if (next[index - 1] < min || next[index] < min) {
    // Scale the pair around their combined space instead of producing negatives.
    const total = before + after;
    const left = Math.min(Math.max(position - lower, min), total - min);
    next[index - 1] = left;
    next[index] = total - left;
  }
  return next;
}

export function addColumn(grid: GridState, fraction = 0.16): GridState {
  if (grid.cols.length >= MAX_DIVISIONS) return grid;
  const scale = 1 - fraction;
  return {
    ...grid,
    cols: [...grid.cols.map((value) => value * scale), fraction],
  };
}

export function addRow(grid: GridState, fraction = 0.16): GridState {
  if (grid.rows.length >= MAX_DIVISIONS) return grid;
  const scale = 1 - fraction;
  return {
    ...grid,
    rows: [...grid.rows.map((value) => value * scale), fraction],
  };
}

function remapMergesAfterRemove(grid: GridState, axis: 'row' | 'col', boundary: number): CellRect[] {
  const key0 = axis === 'row' ? 'r0' : 'c0';
  const key1 = axis === 'row' ? 'r1' : 'c1';
  const result: CellRect[] = [];

  for (const merge of grid.merges) {
    const a = merge[key0];
    const b = merge[key1];
    if (a < boundary && boundary <= b) {
      // A merged cell spanned the divider we just deleted; drop it.
      continue;
    }
    const shiftA = a >= boundary ? a - 1 : a;
    const shiftB = b >= boundary ? b - 1 : b;
    const next: CellRect = { ...merge, [key0]: shiftA, [key1]: shiftB } as CellRect;
    if (next.r0 <= next.r1 && next.c0 <= next.c1) result.push(next);
  }
  return result;
}

export function removeColumnBoundary(grid: GridState, boundary: number): GridState {
  if (boundary <= 0 || boundary >= grid.cols.length) return grid;
  const cols = grid.cols.map((value, index) => {
    if (index === boundary - 1) return value + grid.cols[boundary];
    if (index === boundary) return -1;
    return value;
  }).filter((value) => value >= 0);
  return { cols, rows: grid.rows, merges: remapMergesAfterRemove(grid, 'col', boundary) };
}

export function removeRowBoundary(grid: GridState, boundary: number): GridState {
  if (boundary <= 0 || boundary >= grid.rows.length) return grid;
  const rows = grid.rows.map((value, index) => {
    if (index === boundary - 1) return value + grid.rows[boundary];
    if (index === boundary) return -1;
    return value;
  }).filter((value) => value >= 0);
  return { cols: grid.cols, rows, merges: remapMergesAfterRemove(grid, 'row', boundary) };
}

export function mergeCells(grid: GridState, selected: ResolvedCell[]): GridState {
  if (selected.length < 2) return grid;
  const r0 = Math.min(...selected.map((cell) => cell.r0));
  const r1 = Math.max(...selected.map((cell) => cell.r1));
  const c0 = Math.min(...selected.map((cell) => cell.c0));
  const c1 = Math.max(...selected.map((cell) => cell.c1));
  const rows = grid.rows.length;
  const cols = grid.cols.length;

  const selectedIds = new Set(selected.map((cell) => cell.id));
  let complete = true;
  for (let r = r0; r <= r1 && complete; r += 1) {
    for (let c = c0; c <= c1 && complete; c += 1) {
      const cell = cellAt(grid, r, c);
      if (!cell || !selectedIds.has(cell.id)) complete = false;
    }
  }
  if (!complete) return grid;
  if (r0 === r1 && c0 === c1) return grid;

  const remaining = grid.merges.filter((merge) => {
    const rect = clampRect(merge, rows, cols);
    if (!rect) return false;
    return rect.r1 < r0 || rect.r0 > r1 || rect.c1 < c0 || rect.c0 > c1;
  });
  return { ...grid, merges: [...remaining, { r0, c0, r1, c1 }] };
}

export function splitCell(grid: GridState, cell: ResolvedCell): GridState {
  if (cell.id.startsWith('c')) return grid;
  return {
    ...grid,
    merges: grid.merges.filter((merge) => {
      return !(
        merge.r0 <= cell.r1 &&
        merge.r1 >= cell.r0 &&
        merge.c0 <= cell.c1 &&
        merge.c1 >= cell.c0
      );
    }),
  };
}

export function sanitizeGrid(grid: GridState): GridState {
  const cols = grid.cols.length > 0 ? grid.cols : [1];
  const rows = grid.rows.length > 0 ? grid.rows : [1];
  const normalize = (values: number[]) => {
    const sum = values.reduce((total, value) => total + value, 0);
    return sum > 0 ? values.map((value) => value / sum) : values.map(() => 1 / values.length);
  };
  const normalized = {
    cols: normalize(cols),
    rows: normalize(rows),
  };
  const merges = grid.merges
    .map((merge) => clampRect(merge, normalized.rows.length, normalized.cols.length))
    .filter((merge): merge is CellRect => {
      if (!merge) return false;
      return !(merge.r0 === merge.r1 && merge.c0 === merge.c1);
    });
  return { ...normalized, merges };
}
