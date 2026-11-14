import { useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '../store';
import { cumulative, layoutCells, moveBoundary } from '../lib/grid';
import { round } from '../types';

interface DragState {
  axis: 'col' | 'row';
  index: number;
}

export function GridEditor() {
  const params = useAppStore((state) => state.params);
  const grid = useAppStore((state) => state.grid);
  const selected = useAppStore((state) => state.selectedCells);
  const setSelectedCells = useAppStore((state) => state.setSelectedCells);
  const setGrid = useAppStore((state) => state.setGrid);
  const setPreset = useAppStore((state) => state.setPreset);
  const addGridColumn = useAppStore((state) => state.addGridColumn);
  const addGridRow = useAppStore((state) => state.addGridRow);
  const removeColumnBoundary = useAppStore((state) => state.removeGridColumnBoundary);
  const removeRowBoundary = useAppStore((state) => state.removeGridRowBoundary);
  const mergeSelectedCells = useAppStore((state) => state.mergeSelectedCells);
  const splitGridCell = useAppStore((state) => state.splitGridCell);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);

  const { width, depth, thickness, fillet } = params;
  const pad = Math.max(8, Math.min(width, depth) * 0.07);
  const viewBox = {
    x: -width / 2 - pad,
    y: -depth / 2 - pad,
    w: width + pad * 2,
    h: depth + pad * 2,
  };

  const cells = useMemo(
    () => layoutCells(grid, width, depth, thickness),
    [grid, width, depth, thickness],
  );
  const colBounds = cumulative(grid.cols);
  const rowBounds = cumulative(grid.rows);

  const innerX0 = -width / 2 + thickness;
  const innerY0 = -depth / 2 + thickness;
  const innerW = width - thickness * 2;
  const innerD = depth - thickness * 2;

  const toLocal = (event: ReactPointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const fx = (event.clientX - rect.left) / rect.width;
    const fy = (event.clientY - rect.top) / rect.height;
    return {
      x: viewBox.x + fx * viewBox.w,
      y: viewBox.y + fy * viewBox.h,
    };
  };

  const startDrag = (event: ReactPointerEvent, axis: 'col' | 'row', index: number) => {
    event.stopPropagation();
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(event.pointerId);
    dragRef.current = { axis, index };
    setDragging({ axis, index });
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toLocal(event);
    if (!point) return;
    const current = useAppStore.getState().grid;
    if (drag.axis === 'col') {
      const target = (point.x - innerX0) / innerW;
      setGrid({ ...current, cols: moveBoundary(current.cols, drag.index, target) });
    } else {
      const target = (point.y - innerY0) / innerD;
      setGrid({ ...current, rows: moveBoundary(current.rows, drag.index, target) });
    }
  };

  const endDrag = (event: ReactPointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(null);
    const svg = svgRef.current;
    if (svg?.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  };

  const selectedCells = cells.filter((cell) => selected.includes(cell.id));
  const canMerge = selectedCells.length >= 2;
  const canSplit = selectedCells.length === 1 && !selectedCells[0].id.startsWith('c');

  const handleCellClick = (event: ReactMouseEvent, id: string) => {
    event.stopPropagation();
    const multi = event.shiftKey || event.metaKey || event.ctrlKey;
    if (multi) {
      setSelectedCells(
        selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id],
      );
    } else {
      setSelectedCells(selected.length === 1 && selected[0] === id ? [] : [id]);
    }
  };

  const selectedInfo =
    selectedCells.length === 1
      ? `${round(selectedCells[0].x1 - selectedCells[0].x0, 1)} × ${round(
          selectedCells[0].y1 - selectedCells[0].y0,
          1,
        )} mm`
      : selectedCells.length > 1
        ? `已选 ${selectedCells.length} 个单元格`
        : '点击单元格选择，Shift + 点击可多选';

  return (
    <div className="grid-card">
      <div className="grid-card-head">
        <div>
          <h2>Grid Layout</h2>
          <p>
            {grid.cols.length} 列 × {grid.rows.length} 行 · 拖拽分隔线调整 · 双击删除分隔线
          </p>
        </div>
        <div className="grid-actions">
          <button type="button" onClick={() => setPreset(1, 1)}>
            1 × 1
          </button>
          <button type="button" onClick={() => setPreset(2, 2)}>
            2 × 2
          </button>
          <button type="button" onClick={() => setPreset(3, 3)}>
            3 × 3
          </button>
          <span className="grid-action-separator" />
          <button type="button" onClick={addGridColumn}>
            + 列
          </button>
          <button type="button" onClick={addGridRow}>
            + 行
          </button>
        </div>
      </div>

      <div className="grid-canvas">
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          preserveAspectRatio="none"
          style={{ aspectRatio: `${width + pad * 2} / ${depth + pad * 2}` }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <rect
            x={-width / 2}
            y={-depth / 2}
            width={width}
            height={depth}
            rx={fillet}
            className="grid-outline"
          />
          {cells.map((cell) => {
            const isSelected = selected.includes(cell.id);
            return (
              <g key={cell.id}>
                <rect
                  x={cell.x0}
                  y={cell.y0}
                  width={Math.max(0.1, cell.x1 - cell.x0)}
                  height={Math.max(0.1, cell.y1 - cell.y0)}
                  rx={1}
                  className={`grid-cell ${isSelected ? 'is-selected' : ''}`}
                  onClick={(event) => handleCellClick(event, cell.id)}
                />
                {cell.x1 - cell.x0 > 16 && cell.y1 - cell.y0 > 10 ? (
                  <text
                    x={(cell.x0 + cell.x1) / 2}
                    y={(cell.y0 + cell.y1) / 2}
                    className="grid-cell-label"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {round(cell.x1 - cell.x0, 0)} × {round(cell.y1 - cell.y0, 0)}
                  </text>
                ) : null}
              </g>
            );
          })}

          {colBounds.slice(1, -1).map((value, index) => {
            const x = innerX0 + value * innerW;
            return (
              <g
                key={`col-${index}`}
                className="grid-divider-group is-col"
                onPointerDown={(event) => startDrag(event, 'col', index + 1)}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  removeColumnBoundary(index + 1);
                }}
              >
                <line
                  x1={x}
                  x2={x}
                  y1={-depth / 2 + thickness}
                  y2={depth / 2 - thickness}
                  className="grid-divider-hit"
                />
                <line
                  x1={x}
                  x2={x}
                  y1={-depth / 2 + thickness}
                  y2={depth / 2 - thickness}
                  className={`grid-divider ${
                    dragging?.axis === 'col' && dragging.index === index + 1 ? 'is-dragging' : ''
                  }`}
                />
              </g>
            );
          })}
          {rowBounds.slice(1, -1).map((value, index) => {
            const y = innerY0 + value * innerD;
            return (
              <g
                key={`row-${index}`}
                className="grid-divider-group is-row"
                onPointerDown={(event) => startDrag(event, 'row', index + 1)}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  removeRowBoundary(index + 1);
                }}
              >
                <line
                  x1={-width / 2 + thickness}
                  x2={width / 2 - thickness}
                  y1={y}
                  y2={y}
                  className="grid-divider-hit"
                />
                <line
                  x1={-width / 2 + thickness}
                  x2={width / 2 - thickness}
                  y1={y}
                  y2={y}
                  className={`grid-divider ${
                    dragging?.axis === 'row' && dragging.index === index + 1 ? 'is-dragging' : ''
                  }`}
                />
              </g>
            );
          })}
          <text
            x={0}
            y={depth / 2 + pad * 0.55}
            className="grid-axis-label"
            textAnchor="middle"
          >
            FRONT · {round(width, 0)} mm
          </text>
        </svg>
      </div>

      <div className="grid-card-foot">
        <span className="grid-selection-info">{selectedInfo}</span>
        <div className="grid-actions">
          <button
            type="button"
            className="primary-soft"
            disabled={!canMerge}
            onClick={() => mergeSelectedCells(selectedCells)}
          >
            合并所选
          </button>
          <button
            type="button"
            className="primary-soft"
            disabled={!canSplit}
            onClick={() => canSplit && splitGridCell(selectedCells[0])}
          >
            拆分单元格
          </button>
        </div>
      </div>
    </div>
  );
}
