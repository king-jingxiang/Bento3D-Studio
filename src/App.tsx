import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from './store';
import { ParamPanel } from './components/ParamPanel';
import { Viewport } from './components/Viewport';
import { GridEditor } from './components/GridEditor';
import { NumberInput } from './components/NumberInput';
import { buildModel } from './lib/geometry';
import { download3mf } from './lib/export3mf';
import type { BuildResult, ViewTab } from './types';
import { round } from './types';

function BrandIcon() {
  return (
    <svg viewBox="0 0 32 32" className="brand-icon" aria-hidden="true">
      <path d="M4 10 16 4l12 6-12 6z" fill="#2f81d6" />
      <path d="M4 10v12l12 6V16z" fill="#2f81d6" opacity=".72" />
      <path d="M28 10v12l-12 6V16z" fill="#1f6dbb" opacity=".9" />
      <path d="M9 20.5v4.2l4 2v-4.2z" fill="#ffffff" opacity=".45" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="button-icon" aria-hidden="true">
      <path
        d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SizeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 9V4h5M20 15v5h-5M4 4l5 5m11 6-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 4h16v16H4zM4 12h16M12 4v16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function PreviewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}

interface DimensionHandleProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  position: 'left' | 'right' | 'bottom';
}

function DimensionHandle({ label, value, onChange, position }: DimensionHandleProps) {
  return (
    <div className={`dim-handle dim-${position}`}>
      <button
        type="button"
        className="dim-arrow"
        onClick={() => onChange(value - 1)}
        aria-label={`减小 ${label}`}
      >
        ‹
      </button>
      <div className="dim-pill">
        <span className="dim-label">{label}</span>
        <span className="dim-value">
          <NumberInput
            value={value}
            min={0}
            step={1}
            onCommit={onChange}
            ariaLabel={label}
          />
          <span>mm</span>
        </span>
      </div>
      <button
        type="button"
        className="dim-arrow"
        onClick={() => onChange(value + 1)}
        aria-label={`增大 ${label}`}
      >
        ›
      </button>
    </div>
  );
}

const tabs: { value: ViewTab; label: string; icon: () => ReactNode }[] = [
  { value: 'size', label: 'Size', icon: SizeIcon },
  { value: 'grid', label: 'Grid', icon: GridIcon },
  { value: 'preview', label: 'Preview', icon: PreviewIcon },
];

export default function App() {
  const mode = useAppStore((state) => state.mode);
  const tab = useAppStore((state) => state.tab);
  const setTab = useAppStore((state) => state.setTab);
  const params = useAppStore((state) => state.params);
  const grid = useAppStore((state) => state.grid);
  const setSize = useAppStore((state) => state.setSize);
  const explode = useAppStore((state) => state.explode);

  const [result, setResult] = useState<BuildResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const generation = useRef(0);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6500);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const id = generation.current + 1;
    generation.current = id;
    setBusy(true);
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const next = await buildModel(params, grid, mode);
        if (cancelled || generation.current !== id) return;
        setResult(next);
        if (next.warnings.length > 0) showToast(next.warnings[0]);
      } catch (buildError) {
        console.error(buildError);
        if (cancelled || generation.current !== id) return;
        setError((buildError as Error).message || '几何生成失败');
      } finally {
        if (!cancelled && generation.current === id) setBusy(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [params, grid, mode, showToast]);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const handleDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      const latest = await buildModel(params, grid, mode);
      setResult(latest);
      if (latest.parts.length === 0) {
        throw new Error('没有可导出的几何体');
      }
      const dimensions = `W${round(params.width, 1)}xD${round(params.depth, 1)}xH${round(
        params.height + (params.stackable ? 1 : 0),
        1,
      )}`;
      const prefix = mode === 'set' ? 'bento3d-set' : 'bento3d-tray';
      download3mf(latest.parts, `${prefix}-${dimensions}.3mf`, `Bento3D ${dimensions}mm`);
      showToast(
        mode === 'set'
          ? '已导出托盘 + 收纳盒 + 盖子，共 3 个对象。'
          : '已导出托盘 3MF 文件。',
      );
    } catch (downloadError) {
      console.error(downloadError);
      setError((downloadError as Error).message || '导出失败');
    } finally {
      setBusy(false);
    }
  };

  const boxSummary = useMemo(() => {
    if (mode !== 'set' || !result?.box) return null;
    return `Box ${round(result.box.width, 1)} × ${round(result.box.depth, 1)} × ${round(
      result.box.height,
      1,
    )} mm`;
  }, [mode, result]);

  const trayHeight = result?.tray?.height ?? params.height + (params.stackable ? 1 : 0);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <BrandIcon />
          <span className="brand-name">Bento3D</span>
          <span className="brand-divider">|</span>
          <span className="brand-title">参数化托盘生成器</span>
          <span className="brand-tag">复刻版</span>
        </div>

        <nav className="top-tabs" aria-label="视图切换">
          {tabs.map((item) => {
            return (
              <button
                key={item.value}
                type="button"
                className={tab === item.value ? 'is-active' : ''}
                onClick={() => setTab(item.value)}
              >
                {item.icon()}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="top-actions">
          <button type="button" className="export-button" onClick={handleDownload} disabled={busy}>
            <DownloadIcon />
            <span>{busy ? '生成中…' : 'Download 3MF'}</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <ParamPanel />

        <main className="stage">
          <Viewport
            result={result}
            mode={mode}
            params={params}
            explode={explode}
            busy={busy}
          />

          {tab === 'size' ? (
            <>
              <DimensionHandle
                label="Depth"
                value={params.depth}
                position="left"
                onChange={(value) => setSize('depth', value)}
              />
              <DimensionHandle
                label="Height"
                value={params.height}
                position="right"
                onChange={(value) => setSize('height', value)}
              />
              <DimensionHandle
                label="Width"
                value={params.width}
                position="bottom"
                onChange={(value) => setSize('width', value)}
              />
            </>
          ) : null}

          {tab === 'grid' ? (
            <div className="grid-overlay">
              <GridEditor />
            </div>
          ) : null}

          {tab === 'preview' ? (
            <div className="preview-hint">
              <PreviewIcon />
              <span>拖拽旋转 · 滚轮缩放 · 右键平移</span>
            </div>
          ) : null}

          <div className="stage-info">
            <span className="stage-chip" title={params.stackable ? '含 1 mm 堆叠唇边的总高' : undefined}>
              Tray {round(params.width, 1)} × {round(params.depth, 1)} × {round(trayHeight, 1)} mm
            </span>
            {boxSummary ? <span className="stage-chip">{boxSummary}</span> : null}
            {result ? (
              <span className="stage-chip subtle">
                {result.parts.length} objects · {Math.round(result.durationMs)} ms
              </span>
            ) : null}
          </div>

          {toast ? <div className="toast">{toast}</div> : null}

          {error ? (
            <div className="error-banner" role="alert">
              <strong>几何生成失败</strong>
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}>
                关闭
              </button>
            </div>
          ) : null}

          {busy ? (
            <div className="loading-overlay">
              <span className="spinner" />
              <span>{result ? '更新几何…' : '正在生成几何…'}</span>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
