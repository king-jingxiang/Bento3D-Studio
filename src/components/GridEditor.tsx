import { useId, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '../store';
import { cumulative, layoutCells, moveBoundary } from '../lib/grid';
import { outlinePath } from '../lib/shapes';
import { zoneStyleFor } from '../lib/zones';
import { OUTLINE_SHAPE_LABELS, ZONE_SHAPE_LABELS, round } from '../types';

interface DragState {
  axis: 'col' | 'row';
  index: number;
}

export function GridEditor() {
  const mode = useAppStore((state) => state.mode);
  const params = useAppStore((state) => state.params);
  const globalGrid = useAppStore((state) => state.grid);
  const zonesGrid = useAppStore((state) => state.zonesGrid);
  const organizer = useAppStore((state) => state.organizer);
  const zones = useAppStore((state) => state.zones);
  const activeLayerId = useAppStore((state) => state.activeLayerId);
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
  const clipId = useId().replace(/:/g, '');

  const layerIndex = organizer.layers.findIndex((layer) => layer.id === activeLayerId);
  const activeLayer = layerIndex >= 0 ? organizer.layers[layerIndex] : organizer.layers[0];
  const isOrganizer = mode === 'organizer';
  const isZones = mode === 'zones';
  const grid = isOrganizer ? activeLayer.grid : isZones ? zonesGrid : globalGrid;
  const shape = isOrganizer ? activeLayer.shape : isZones ? zones.outline : 'rounded';

  const width = params.width;
  const depth = isOrganizer ? activeLayer.depth : params.depth;
  const { thickness, fillet } = params;
  const pad = Math.max(8, Math.min(width, depth) * 0.07);
  const viewBox = {
    x: -width / 2 - pad,
    y: -depth / 2 - pad,
    w: width + pad * 2,
    h: depth + pad * 2,
  };
  const outerPath = outlinePath(shape, width, depth, fillet);
  const innerPath = outlinePath(
    shape,
    Math.max(2, width - thickness * 2),
    Math.max(2, depth - thickness * 2),
    Math.max(0.2, fillet - thickness),
  );

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
    const state = useAppStore.getState();
    const current = isOrganizer
      ? (state.organizer.layers.find((layer) => layer.id === state.activeLayerId) ??
        state.organizer.layers[0]).grid
      : isZones
        ? state.zonesGrid
        : state.grid;
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
          <h2>{isOrganizer ? `分区布局 · ${activeLayer.name}` : '分区布局'}</h2>
          <p>
            {isOrganizer
              ? `${OUTLINE_SHAPE_LABELS[shape]} · 深度 ${round(depth, 1)} × 高 ${round(
                  activeLayer.height,
                  1,
                )} mm · ${grid.cols.length} 列 × ${grid.rows.length} 行`
              : isZones
                ? `${OUTLINE_SHAPE_LABELS[shape]} · ${round(width, 0)} × ${round(
                    depth,
                    0,
                  )} mm · ${cells.length} 个分区`
                : `${grid.cols.length} 列 × ${grid.rows.length} 行 · 拖拽分隔线调整 · 双击删除分隔线`}
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
          <defs>
            <clipPath id={clipId}>
              <path d={innerPath} />
            </clipPath>
          </defs>
          <path d={outerPath} className="grid-outline" />
          <g clipPath={`url(#${clipId})`}>
          {cells.map((cell) => {
            const isSelected = selected.includes(cell.id);
            const zoneStyle = isZones ? zoneStyleFor(cell, zones) : null;
            return (
              <g key={cell.id}>
                <rect
                  x={cell.x0}
                  y={cell.y0}
                  width={Math.max(0.1, cell.x1 - cell.x0)}
                  height={Math.max(0.1, cell.y1 - cell.y0)}
                  rx={1}
                  className={`grid-cell ${isSelected ? 'is-selected' : ''} ${
                    zoneStyle ? `is-zone-${zoneStyle.shape}` : ''
                  }`}
                  onClick={(event) => handleCellClick(event, cell.id)}
                >
                  {zoneStyle ? (
                    <title>
                      {`${ZONE_SHAPE_LABELS[zoneStyle.shape]} · 高 ${round(
                        zoneStyle.height,
                        0,
                      )} mm`}
                    </title>
                  ) : null}
                </rect>
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
          </g>
          <text
            x={0}
            y={depth / 2 + pad * 0.55}
            className="grid-axis-label"
            textAnchor="middle"
          >
            前 · {round(width, 0)} mm
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
