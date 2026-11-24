import { useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useAppStore } from '../store';
import {
  APP_MODE_LABELS,
  HOLE_MARGIN,
  LIMITS,
  OUTLINE_SHAPES,
  OUTLINE_SHAPE_LABELS,
  ZONE_SHAPES,
  ZONE_SHAPE_LABELS,
  clamp,
  round,
} from '../types';
import type { HoleShape, LayerConfig, MarginPreset, OutlineShape, ZoneShape } from '../types';
import { MAX_DIVISIONS, layoutCells, type LaidOutCell } from '../lib/grid';
import { zoneAnchor, zoneStyleFor } from '../lib/zones';
import { NumberInput } from './NumberInput';

function Icon({ name, className = '' }: { name: string; className?: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (name === 'partition') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <rect x="3" y="4" width="18" height="16" rx="2" {...common} />
        <path d="M12 4v16" {...common} />
      </svg>
    );
  }
  if (name === 'stack') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M4 8.5 12 4l8 4.5-8 4.5z" {...common} />
        <path d="m4 13 8 4.5L20 13M4 17l8 4.5L20 17" {...common} />
      </svg>
    );
  }
  if (name === 'unstack') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <rect x="4" y="7" width="16" height="12" rx="2" {...common} />
        <path d="M4 11h16" {...common} />
      </svg>
    );
  }
  if (name === 'hex') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M12 3.2 20 7.8v8.4L12 20.8 4 16.2V7.8z" {...common} />
        <path d="M12 8.2 16.4 10.6v4.8L12 17.8 7.6 15.4v-4.8z" {...common} opacity="0.55" />
      </svg>
    );
  }
  if (name === 'circle') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <circle cx="12" cy="12" r="8" {...common} />
        <circle cx="12" cy="12" r="3.2" {...common} opacity="0.55" />
      </svg>
    );
  }
  if (name === 'label') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M4 7a2 2 0 0 1 2-2h9l5 7-5 7H6a2 2 0 0 1-2-2z" {...common} />
        <path d="M8 12h6" {...common} />
      </svg>
    );
  }
  if (name === 'finger') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M5 20V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11" {...common} />
        <path d="M9 7V5.5a3 3 0 0 1 6 0V7" {...common} />
      </svg>
    );
  }
  if (name === 'reset') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M4 5v5h5" {...common} />
        <path d="M4.6 10a8 8 0 1 1 1.3 8.2" {...common} />
      </svg>
    );
  }
  if (name === 'layers') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M4 6h16M4 12h16M4 18h16" {...common} />
      </svg>
    );
  }
  if (name === 'zones') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <rect x="3" y="4" width="18" height="16" rx="2" {...common} />
        <path d="M12 4v16M3 12h18" {...common} />
        <circle cx="7.5" cy="8" r="2" {...common} />
        <circle cx="16.5" cy="16" r="2.4" {...common} />
      </svg>
    );
  }
  return null;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  hint?: string;
  unit?: string;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  hint,
  unit = 'mm',
}: SliderRowProps) {
  return (
    <div className="field">
      <div className="field-head">
        <label className="field-label" title={hint}>
          {label}
          {hint ? <span className="hint-dot">?</span> : null}
        </label>
        <div className="value-box">
          <NumberInput
            value={value}
            min={min}
            max={max}
            step={step}
            onCommit={onChange}
            ariaLabel={label}
          />
          <span>{unit}</span>
        </div>
      </div>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamp(value, min, max)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <div className="toggle-row">
      <span className="toggle-label">{label}</span>
      <button
        type="button"
        className={`switch ${checked ? 'is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" />
        <span className="switch-text">{checked ? '开' : '关'}</span>
      </button>
    </div>
  );
}

function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function OrganizerLayerCard({ layer, index }: { layer: LayerConfig; index: number }) {
  const organizer = useAppStore((state) => state.organizer);
  const activeLayerId = useAppStore((state) => state.activeLayerId);
  const setActiveLayer = useAppStore((state) => state.setActiveLayer);
  const updateOrganizerLayer = useAppStore((state) => state.updateOrganizerLayer);
  const removeOrganizerLayer = useAppStore((state) => state.removeOrganizerLayer);
  const moveOrganizerLayer = useAppStore((state) => state.moveOrganizerLayer);

  const stop = (event: ReactMouseEvent) => event.stopPropagation();
  const isActive = layer.id === activeLayerId;
  const isFirst = index === 0;
  const isLast = index === organizer.layers.length - 1;

  return (
    <div
      className={`layer-item ${isActive ? 'is-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => setActiveLayer(layer.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setActiveLayer(layer.id);
      }}
    >
      <div className="layer-item-head">
        <span className="layer-index">{index + 1}</span>
        <input
          className="layer-name"
          value={layer.name}
          maxLength={24}
          placeholder={`第 ${index + 1} 层`}
          aria-label={`第 ${index + 1} 层名称`}
          onClick={stop}
          onChange={(event) => updateOrganizerLayer(layer.id, { name: event.target.value })}
        />
        <div className="layer-item-actions" onClick={stop}>
          <button
            type="button"
            title="上移"
            disabled={isFirst}
            onClick={() => moveOrganizerLayer(layer.id, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            title="下移"
            disabled={isLast}
            onClick={() => moveOrganizerLayer(layer.id, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            title="删除该层"
            disabled={organizer.layers.length <= LIMITS.layerCount[0]}
            onClick={() => removeOrganizerLayer(layer.id)}
          >
            ×
          </button>
        </div>
      </div>

      <div className="layer-fields">
        <label className="layer-field">
          <span>深度</span>
          <span className="layer-value">
            <NumberInput
              value={layer.depth}
              min={LIMITS.layerDepth[0]}
              max={LIMITS.layerDepth[1]}
              step={1}
              ariaLabel={`第 ${index + 1} 层深度`}
              onCommit={(value) => updateOrganizerLayer(layer.id, { depth: value })}
            />
            <span>mm</span>
          </span>
        </label>
        <label className="layer-field">
          <span>高度</span>
          <span className="layer-value">
            <NumberInput
              value={layer.height}
              min={LIMITS.layerHeight[0]}
              max={LIMITS.layerHeight[1]}
              step={1}
              ariaLabel={`第 ${index + 1} 层高度`}
              onCommit={(value) => updateOrganizerLayer(layer.id, { height: value })}
            />
            <span>mm</span>
          </span>
        </label>
      </div>

      <div className="layer-shape-row" onClick={stop}>
        <select
          className="layer-select"
          value={layer.shape}
          aria-label={`第 ${index + 1} 层外形`}
          onChange={(event) =>
            updateOrganizerLayer(layer.id, { shape: event.target.value as OutlineShape })
          }
        >
          {OUTLINE_SHAPES.map((shape) => (
            <option key={shape} value={shape}>
              {OUTLINE_SHAPE_LABELS[shape]}
            </option>
          ))}
        </select>
        <span className="layer-grid-note">
          {layer.grid.cols.length} × {layer.grid.rows.length} 格
        </span>
      </div>

      <div className="height-presets" onClick={stop}>
        <span className="micro-note">高度</span>
        {[16, 24, 32, 42].map((height) => (
          <button
            key={height}
            type="button"
            className={Math.abs(layer.height - height) < 0.6 ? 'is-active' : ''}
            onClick={() => updateOrganizerLayer(layer.id, { height })}
          >
            {height}
          </button>
        ))}
      </div>
    </div>
  );
}

function ZoneCard({ cell, index }: { cell: LaidOutCell; index: number }) {
  const zones = useAppStore((state) => state.zones);
  const updateZoneStyle = useAppStore((state) => state.updateZoneStyle);
  const style = zoneStyleFor(cell, zones);
  const anchor = zoneAnchor(cell.r0, cell.c0);
  const cellsWide = cell.c1 - cell.c0 + 1;
  const cellsDeep = cell.r1 - cell.r0 + 1;

  return (
    <div className="layer-item zone-item">
      <div className="layer-item-head">
        <span className="layer-index">{index + 1}</span>
        <span className="zone-size">
          {round(cell.x1 - cell.x0, 0)} × {round(cell.y1 - cell.y0, 0)} mm
        </span>
        <span className="layer-grid-note">
          {cellsWide} × {cellsDeep} 格
        </span>
      </div>

      <div className="layer-fields">
        <label className="layer-field">
          <span>高度</span>
          <span className="layer-value">
            <NumberInput
              value={style.height}
              min={LIMITS.zoneHeight[0]}
              max={LIMITS.zoneHeight[1]}
              step={1}
              ariaLabel={`分区 ${index + 1} 高度`}
              onCommit={(height) => updateZoneStyle(anchor, { height })}
            />
            <span>mm</span>
          </span>
        </label>
        <label className="layer-field">
          <span>内腔</span>
          <span className="layer-value">
            <select
              className="layer-select"
              value={style.shape}
              aria-label={`分区 ${index + 1} 内腔形状`}
              onChange={(event) =>
                updateZoneStyle(anchor, { shape: event.target.value as ZoneShape })
              }
            >
              {ZONE_SHAPES.map((shape) => (
                <option key={shape} value={shape}>
                  {ZONE_SHAPE_LABELS[shape]}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
    </div>
  );
}

function ZonesPanel() {
  const params = useAppStore((state) => state.params);
  const zones = useAppStore((state) => state.zones);
  const grid = useAppStore((state) => state.zonesGrid);
  const setSize = useAppStore((state) => state.setSize);
  const setThickness = useAppStore((state) => state.setThickness);
  const setFillet = useAppStore((state) => state.setFillet);
  const updateZones = useAppStore((state) => state.updateZones);
  const addGridColumn = useAppStore((state) => state.addGridColumn);
  const removeGridColumnBoundary = useAppStore((state) => state.removeGridColumnBoundary);

  const cells = useMemo(
    () => layoutCells(grid, params.width, params.depth, params.thickness),
    [grid, params.width, params.depth, params.thickness],
  );
  const totalHeight = cells.length
    ? Math.max(...cells.map((cell) => zoneStyleFor(cell, zones).height))
    : zones.defaultHeight;

  return (
    <>
      <div className="panel-section">
        <SliderRow
          label="整体宽度"
          value={params.width}
          min={LIMITS.width[0]}
          max={LIMITS.width[1]}
          step={1}
          onChange={(value) => setSize('width', value)}
        />
        <SliderRow
          label="整体深度"
          value={params.depth}
          min={LIMITS.depth[0]}
          max={LIMITS.depth[1]}
          step={1}
          onChange={(value) => setSize('depth', value)}
        />
        <SliderRow
          label="壁厚"
          value={params.thickness}
          min={LIMITS.thickness[0]}
          max={LIMITS.thickness[1]}
          step={0.1}
          onChange={setThickness}
          hint="外壁与分区隔板的厚度，建议不低于喷嘴直径。"
        />
        <SliderRow
          label="圆角半径"
          value={params.fillet}
          min={0}
          max={LIMITS.fillet[1]}
          step={0.5}
          onChange={setFillet}
          hint="整体外轮廓的圆角，仅对圆角/矩形外形生效。"
        />
        <div className="field">
          <div className="field-head">
            <span className="field-label">整体外形</span>
          </div>
          <select
            className="layer-select"
            value={zones.outline}
            aria-label="整体外形"
            onChange={(event) =>
              updateZones({ outline: event.target.value as OutlineShape })
            }
          >
            {OUTLINE_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {OUTLINE_SHAPE_LABELS[shape]}
              </option>
            ))}
          </select>
          <p className="field-note">
            外形只决定整体轮廓，各分区共用隔板；椭圆、六边形等外形会裁掉边角。
          </p>
        </div>
        <SliderRow
          label="默认分区高度"
          value={zones.defaultHeight}
          min={LIMITS.zoneHeight[0]}
          max={LIMITS.zoneHeight[1]}
          step={1}
          onChange={(defaultHeight) => updateZones({ defaultHeight })}
          hint="未单独设置的分区沿用该高度。"
        />
      </div>

      <div className="panel-section">
        <div className="section-title with-action">
          <span className="section-title-text">
            <Icon name="zones" className="icon" />
            <span>分区（{cells.length}）</span>
          </span>
          <div className="zone-actions">
            <button
              type="button"
              className="add-layer-button"
              onClick={addGridColumn}
              disabled={grid.cols.length >= MAX_DIVISIONS}
            >
              + 添加分区
            </button>
            <button
              type="button"
              className="add-layer-button"
              onClick={() => removeGridColumnBoundary(grid.cols.length - 1)}
              disabled={grid.cols.length <= 1}
            >
              − 删除分区
            </button>
          </div>
        </div>
        <div className="layer-list">
          {cells.map((cell, index) => (
            <ZoneCard key={cell.id} cell={cell} index={index} />
          ))}
        </div>
        <p className="field-note">
          点击“添加分区”新增一列分区，“删除分区”移除最后一列分区。也可在“分区”视图中拖拽分隔线、框选合并。圆形、椭圆、六边形内腔适合笔、
          牙刷、化妆刷等竖放物品；当前最高分区 {round(totalHeight, 1)} mm。
        </p>
      </div>
    </>
  );
}

export function ParamPanel() {
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const params = useAppStore((state) => state.params);
  const reset = useAppStore((state) => state.reset);
  const setSize = useAppStore((state) => state.setSize);
  const setThickness = useAppStore((state) => state.setThickness);
  const setFillet = useAppStore((state) => state.setFillet);
  const setPartitionHeight = useAppStore((state) => state.setPartitionHeight);
  const setStackable = useAppStore((state) => state.setStackable);
  const updateChamfer = useAppStore((state) => state.updateChamfer);
  const updateWall = useAppStore((state) => state.updateWall);
  const updateLabel = useAppStore((state) => state.updateLabel);
  const updateFingerPull = useAppStore((state) => state.updateFingerPull);
  const updateBox = useAppStore((state) => state.updateBox);
  const organizer = useAppStore((state) => state.organizer);
  const addOrganizerLayer = useAppStore((state) => state.addOrganizerLayer);
  const updateOrganizer = useAppStore((state) => state.updateOrganizer);
  const explode = useAppStore((state) => state.explode);
  const setExplode = useAppStore((state) => state.setExplode);

  const isOrganizer = mode === 'organizer';
  const isZones = mode === 'zones';
  const chamferMax = Math.max(
    LIMITS.chamfer[0],
    Math.min(LIMITS.chamfer[1], params.thickness * 0.6),
  );
  const totalHeight = organizer.layers.reduce((sum, layer) => sum + layer.height, 0);

  return (
    <aside className="panel">
      <div className="panel-header">
        <div className="mode-select">
          <span className="mode-icon">
            <Icon
              name={isZones ? 'zones' : isOrganizer ? 'layers' : 'partition'}
              className="icon"
            />
          </span>
          <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
            {(['tray', 'set', 'organizer', 'zones'] as const).map((item) => (
              <option key={item} value={item}>
                {APP_MODE_LABELS[item]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="ghost-button" onClick={reset} title="恢复默认参数">
          <Icon name="reset" className="icon" />
        </button>
      </div>

      {isZones ? (
        <ZonesPanel />
      ) : isOrganizer ? (
        <>
          <div className="panel-section">
            <SliderRow
              label="整体宽度"
              value={params.width}
              min={LIMITS.width[0]}
              max={LIMITS.width[1]}
              step={1}
              onChange={(value) => setSize('width', value)}
              hint="所有收纳层共用同一个宽度。"
            />
            <SliderRow
              label="壁厚"
              value={params.thickness}
              min={LIMITS.thickness[0]}
              max={LIMITS.thickness[1]}
              step={0.1}
              onChange={setThickness}
              hint="外壁与隔板的厚度，建议不低于喷嘴直径。"
            />
            <SliderRow
              label="圆角半径"
              value={params.fillet}
              min={0}
              max={LIMITS.fillet[1]}
              step={0.5}
              onChange={setFillet}
              hint="方形与圆角外形使用该圆角。"
            />
            <SliderRow
              label="隔板下沉"
              value={organizer.dividerInset}
              min={LIMITS.dividerInset[0]}
              max={LIMITS.dividerInset[1]}
              step={0.5}
              onChange={(dividerInset) => updateOrganizer({ dividerInset })}
              hint="隔板比外壁低下的距离，便于取放物品。"
            />
            <div className="field">
              <div className="field-head">
                <span className="field-label">层对齐</span>
              </div>
              <Segment
                value={organizer.align}
                onChange={(align) => updateOrganizer({ align })}
                options={[
                  { value: 'back', label: '靠后对齐' },
                  { value: 'center', label: '居中对齐' },
                ]}
              />
              <p className="field-note">
                靠后对齐时，上层较浅的深度形成阶梯式台面，前部保持开放。
              </p>
            </div>
          </div>

          <div className="panel-section">
            <div className="section-title with-action">
              <span className="section-title-text">
                <Icon name="layers" className="icon" />
                <span>收纳层（{organizer.layers.length}）</span>
              </span>
              <button
                type="button"
                className="add-layer-button"
                onClick={addOrganizerLayer}
                disabled={organizer.layers.length >= LIMITS.layerCount[1]}
              >
                + 添加层
              </button>
            </div>

            <div className="layer-list">
              {organizer.layers.map((layer, index) => (
                <OrganizerLayerCard key={layer.id} layer={layer} index={index} />
              ))}
            </div>

            <p className="field-note">
              总高度约 {round(totalHeight, 1)} mm，层序从下到上。切换层后可在“分区”视图中编辑该层分格。
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="panel-section">
            <SliderRow
              label="壁厚"
              value={params.thickness}
              min={LIMITS.thickness[0]}
              max={LIMITS.thickness[1]}
              step={0.1}
              onChange={setThickness}
              hint="外壁与隔板的厚度，建议 25% 喷嘴直径以上。"
            />
            <SliderRow
              label="圆角半径"
              value={params.fillet}
              min={0}
              max={LIMITS.fillet[1]}
              step={0.1}
              onChange={setFillet}
              hint="托盘外轮廓的圆角半径。"
            />
            <div className="field">
              <div className="field-head">
                <label className="field-label" htmlFor="partition-height">
                  隔板高度
                  <span className="hint-dot">?</span>
                </label>
                <div className="value-box">
                  <NumberInput
                    id="partition-height"
                    value={params.partitionHeight}
                    min={params.thickness + 1}
                    max={params.height - 0.6}
                    step={0.5}
                    onCommit={setPartitionHeight}
                    ariaLabel="隔板高度"
                  />
                  <span>mm</span>
                </div>
              </div>
              <p className="field-note">低于外壁，便于取放物品。</p>
            </div>

            <div className="field">
              <div className="field-head">
                <span className="field-label">
                  堆叠方式
                  <span className="hint-dot">?</span>
                </span>
              </div>
              <Segment
                value={params.stackable ? 'stackable' : 'unstackable'}
                onChange={(value) => setStackable(value === 'stackable')}
                options={[
                  {
                    value: 'unstackable',
                    label: (
                      <span className="stack-option">
                        <Icon name="unstack" className="icon" />
                        <span>不可堆叠</span>
                      </span>
                    ),
                  },
                  {
                    value: 'stackable',
                    label: (
                      <span className="stack-option">
                        <Icon name="stack" className="icon" />
                        <span>可堆叠</span>
                      </span>
                    ),
                  },
                ]}
              />
              {params.stackable ? (
                <p className="field-note">顶部堆叠唇边会让每只托盘的总高增加 1 mm。</p>
              ) : null}
            </div>
          </div>

          <div className={`panel-section ${params.chamfer.enabled ? '' : 'is-collapsed'}`}>
            <Toggle
              label="倒角"
              checked={params.chamfer.enabled}
              onChange={(enabled) => updateChamfer({ enabled })}
            />
            {params.chamfer.enabled ? (
              <div className="sub-options">
                <SliderRow
                  label="倒角尺寸"
                  value={params.chamfer.size}
                  min={LIMITS.chamfer[0]}
                  max={chamferMax}
                  step={0.1}
                  onChange={(size) => updateChamfer({ size })}
                  hint="托盘顶部外沿与取物口的 45° 倒角尺寸。"
                />
                <p className="field-note">
                  托盘顶部外沿、取物缺口边缘均做 45° 倒角，去除锐边，避免划手。
                </p>
              </div>
            ) : null}
          </div>

          <div className={`panel-section ${params.wall.enabled ? '' : 'is-collapsed'}`}>
            <Toggle
              label="墙面花纹"
              checked={params.wall.enabled}
              onChange={(enabled) => updateWall({ enabled })}
            />
            {params.wall.enabled ? (
              <div className="sub-options">
                <span className="sub-label">孔洞形状</span>
                <div className="shape-cards">
                  {(['hexagon', 'circle'] as HoleShape[]).map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      className={`shape-card ${params.wall.shape === shape ? 'is-active' : ''}`}
                      onClick={() => updateWall({ shape })}
                    >
                      <Icon name={shape === 'hexagon' ? 'hex' : 'circle'} className="shape-icon" />
                      <span>{shape === 'hexagon' ? '六边形' : '圆形'}</span>
                    </button>
                  ))}
                </div>
                <SliderRow
                  label="孔径"
                  value={params.wall.holeSize}
                  min={LIMITS.holeSize[0]}
                  max={LIMITS.holeSize[1]}
                  step={0.5}
                  onChange={(holeSize) => updateWall({ holeSize })}
                  hint="孔洞的公称尺寸；过大会与上下边缘相交。"
                />
                <div className="field">
                  <div className="field-head">
                    <span className="field-label">孔距</span>
                  </div>
                  <Segment<MarginPreset>
                    value={params.wall.margin}
                    onChange={(margin) => updateWall({ margin })}
                    options={[
                      { value: 'dense', label: '密集' },
                      { value: 'normal', label: '标准' },
                      { value: 'relaxed', label: '宽松' },
                    ]}
                  />
                  <p className="field-note">
                    孔间距 {HOLE_MARGIN[params.wall.margin]} mm，边缘留白 3 mm。
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className={`panel-section ${params.label.enabled ? '' : 'is-collapsed'}`}>
            <Toggle
              label="标签浮雕"
              checked={params.label.enabled}
              onChange={(enabled) => updateLabel({ enabled })}
            />
            {params.label.enabled ? (
              <div className="sub-options">
                <div className="field">
                  <div className="field-head">
                    <label className="field-label" htmlFor="label-text">
                      标签文字
                    </label>
                    <span className="micro-note">最多 16 字符</span>
                  </div>
                  <input
                    id="label-text"
                    className="text-input"
                    value={params.label.text}
                    maxLength={16}
                    onChange={(event) => updateLabel({ text: event.target.value })}
                    placeholder="例如 SCREWS"
                  />
                </div>
                <p className="field-note">在前壁生成 0.7 mm 高的凸起文字。</p>
              </div>
            ) : null}
          </div>

          <div className={`panel-section ${params.fingerPull.enabled ? '' : 'is-collapsed'}`}>
            <Toggle
              label="取物缺口"
              checked={params.fingerPull.enabled}
              onChange={(enabled) => updateFingerPull({ enabled })}
            />
            {params.fingerPull.enabled ? (
              <div className="sub-options">
                <SliderRow
                  label="缺口宽度"
                  value={params.fingerPull.width}
                  min={LIMITS.fingerWidth[0]}
                  max={Math.min(LIMITS.fingerWidth[1], params.width - 12)}
                  step={1}
                  onChange={(width) => updateFingerPull({ width })}
                />
                <SliderRow
                  label="缺口高度"
                  value={params.fingerPull.height}
                  min={LIMITS.fingerHeight[0]}
                  max={Math.min(LIMITS.fingerHeight[1], Math.max(7, params.height - 2))}
                  step={1}
                  onChange={(height) => updateFingerPull({ height })}
                />
              </div>
            ) : null}
          </div>

          {mode === 'set' ? (
            <div className="panel-section box-section">
              <div className="section-title">
                <Icon name="layers" className="icon" />
                <span>收纳盒 &amp; 盖子</span>
              </div>
              <div className="stepper-row">
                <span className="field-label">可叠放托盘数</span>
                <div className="stepper">
                  <button
                    type="button"
                    onClick={() => updateBox({ trayCount: params.box.trayCount - 1 })}
                    disabled={params.box.trayCount <= LIMITS.trayCount[0]}
                  >
                    −
                  </button>
                  <span>{params.box.trayCount}</span>
                  <button
                    type="button"
                    onClick={() => updateBox({ trayCount: params.box.trayCount + 1 })}
                    disabled={params.box.trayCount >= LIMITS.trayCount[1]}
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="field-note">盒子按该容量设计；3MF 中包含 1 只托盘，可按需重复打印。</p>
              <SliderRow
                label="托盘间隙"
                value={params.box.clearance}
                min={LIMITS.clearance[0]}
                max={LIMITS.clearance[1]}
                step={0.05}
                onChange={(clearance) => updateBox({ clearance })}
                hint="托盘外壁与收纳盒内壁之间的单边间隙。"
              />
              <Toggle
                label="卡扣盖"
                checked={params.box.lid}
                onChange={(lid) => updateBox({ lid })}
              />
              <SliderRow
                label="爆炸视图"
                value={explode}
                min={0}
                max={1}
                step={0.01}
                unit=""
                onChange={setExplode}
                hint="仅影响预览中盖子的悬浮高度。"
              />
            </div>
          ) : null}
        </>
      )}

      <div className="panel-footer">
        <div className="footer-note">
          全部尺寸单位为 mm。3MF 文件可直接导入 Bambu Studio、Orca Slicer 或其他切片软件。
        </div>
      </div>
    </aside>
  );
}
