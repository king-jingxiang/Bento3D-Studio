import type { ReactNode } from 'react';
import { useAppStore } from '../store';
import { HOLE_MARGIN, LIMITS, clamp } from '../types';
import type { HoleShape, MarginPreset } from '../types';
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
  return null;
}

function ProChip() {
  return <span className="pro-chip">PRO</span>;
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
  pro,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  pro?: boolean;
}) {
  return (
    <div className="toggle-row">
      <span className="toggle-label">
        {label}
        {pro ? <ProChip /> : null}
      </span>
      <button
        type="button"
        className={`switch ${checked ? 'is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" />
        <span className="switch-text">{checked ? 'ON' : 'OFF'}</span>
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

export function ParamPanel() {
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const params = useAppStore((state) => state.params);
  const reset = useAppStore((state) => state.reset);
  const setThickness = useAppStore((state) => state.setThickness);
  const setFillet = useAppStore((state) => state.setFillet);
  const setPartitionHeight = useAppStore((state) => state.setPartitionHeight);
  const setStackable = useAppStore((state) => state.setStackable);
  const updateWall = useAppStore((state) => state.updateWall);
  const updateLabel = useAppStore((state) => state.updateLabel);
  const updateFingerPull = useAppStore((state) => state.updateFingerPull);
  const updateBox = useAppStore((state) => state.updateBox);
  const explode = useAppStore((state) => state.explode);
  const setExplode = useAppStore((state) => state.setExplode);

  return (
    <aside className="panel">
      <div className="panel-header">
        <div className="mode-select">
          <span className="mode-icon">
            <Icon name="partition" className="icon" />
          </span>
          <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
            <option value="tray">Partition</option>
            <option value="set">Partition &amp; Box</option>
          </select>
        </div>
        <button type="button" className="ghost-button" onClick={reset} title="恢复默认参数">
          <Icon name="reset" className="icon" />
        </button>
      </div>

      <div className="panel-section">
        <SliderRow
          label="Thickness"
          value={params.thickness}
          min={LIMITS.thickness[0]}
          max={LIMITS.thickness[1]}
          step={0.1}
          onChange={setThickness}
          hint="外壁与隔板的厚度，建议 25% 喷嘴直径以上。"
        />
        <SliderRow
          label="Fillet"
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
              Partition Height
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
                ariaLabel="Partition Height"
              />
              <span>mm</span>
            </div>
          </div>
          <p className="field-note">低于外壁，便于取放物品。</p>
        </div>

        <div className="field">
          <div className="field-head">
            <span className="field-label">
              Stack
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
                    <span>unstakable</span>
                  </span>
                ),
              },
              {
                value: 'stackable',
                label: (
                  <span className="stack-option">
                    <Icon name="stack" className="icon" />
                    <span>stackable</span>
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

      <div className={`panel-section ${params.wall.enabled ? '' : 'is-collapsed'}`}>
        <Toggle
          label="Wall Pattern"
          pro
          checked={params.wall.enabled}
          onChange={(enabled) => updateWall({ enabled })}
        />
        {params.wall.enabled ? (
          <div className="sub-options">
            <span className="sub-label">Hole Shape</span>
            <div className="shape-cards">
              {(['hexagon', 'circle'] as HoleShape[]).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  className={`shape-card ${params.wall.shape === shape ? 'is-active' : ''}`}
                  onClick={() => updateWall({ shape })}
                >
                  <Icon name={shape === 'hexagon' ? 'hex' : 'circle'} className="shape-icon" />
                  <span>{shape}</span>
                </button>
              ))}
            </div>
            <SliderRow
              label="Hole Size"
              value={params.wall.holeSize}
              min={LIMITS.holeSize[0]}
              max={LIMITS.holeSize[1]}
              step={0.5}
              onChange={(holeSize) => updateWall({ holeSize })}
              hint="孔洞的公称尺寸；过大会与上下边缘相交。"
            />
            <div className="field">
              <div className="field-head">
                <span className="field-label">Hole Margin</span>
              </div>
              <Segment<MarginPreset>
                value={params.wall.margin}
                onChange={(margin) => updateWall({ margin })}
                options={[
                  { value: 'dense', label: `dense` },
                  { value: 'normal', label: `normal` },
                  { value: 'relaxed', label: `relaxed` },
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
          label="Label"
          pro
          checked={params.label.enabled}
          onChange={(enabled) => updateLabel({ enabled })}
        />
        {params.label.enabled ? (
          <div className="sub-options">
            <div className="field">
              <div className="field-head">
                <label className="field-label" htmlFor="label-text">
                  Text
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
          label="Finger Pull"
          pro
          checked={params.fingerPull.enabled}
          onChange={(enabled) => updateFingerPull({ enabled })}
        />
        {params.fingerPull.enabled ? (
          <div className="sub-options">
            <SliderRow
              label="Notch Width"
              value={params.fingerPull.width}
              min={LIMITS.fingerWidth[0]}
              max={Math.min(LIMITS.fingerWidth[1], params.width - 12)}
              step={1}
              onChange={(width) => updateFingerPull({ width })}
            />
            <SliderRow
              label="Notch Height"
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
            label="Tray Clearance"
            value={params.box.clearance}
            min={LIMITS.clearance[0]}
            max={LIMITS.clearance[1]}
            step={0.05}
            onChange={(clearance) => updateBox({ clearance })}
            hint="托盘外壁与收纳盒内壁之间的单边间隙。"
          />
          <Toggle
            label="Snap Lid"
            checked={params.box.lid}
            onChange={(lid) => updateBox({ lid })}
          />
          <SliderRow
            label="Explode"
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

      <div className="panel-footer">
        <div className="footer-note">
          全部尺寸单位为 mm。3MF 文件可直接导入 Bambu Studio、Orca Slicer 或其他切片软件。
        </div>
      </div>
    </aside>
  );
}
