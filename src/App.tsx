import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from './store';
import { ParamPanel } from './components/ParamPanel';
import { Viewport } from './components/Viewport';
import { GridEditor } from './components/GridEditor';
import { NumberInput } from './components/NumberInput';
import { buildModel } from './lib/geometry';
import { download3mf } from './lib/export3mf';
import {
  buildShareUrl,
  createConfig,
  downloadConfig,
  normalizeConfig,
  readConfigFromLocation,
} from './lib/config';
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
        aria-label={`减小${label}`}
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
        aria-label={`增大${label}`}
      >
        ›
      </button>
    </div>
  );
}

const tabs: { value: ViewTab; label: string; icon: () => ReactNode }[] = [
  { value: 'size', label: '尺寸', icon: SizeIcon },
  { value: 'grid', label: '分区', icon: GridIcon },
  { value: 'preview', label: '预览', icon: PreviewIcon },
];

export default function App() {
  const mode = useAppStore((state) => state.mode);
  const tab = useAppStore((state) => state.tab);
  const setTab = useAppStore((state) => state.setTab);
  const params = useAppStore((state) => state.params);
  const grid = useAppStore((state) => state.grid);
  const zonesGrid = useAppStore((state) => state.zonesGrid);
  const organizer = useAppStore((state) => state.organizer);
  const zones = useAppStore((state) => state.zones);
  const activeLayerId = useAppStore((state) => state.activeLayerId);
  const updateOrganizerLayer = useAppStore((state) => state.updateOrganizerLayer);
  const applyConfig = useAppStore((state) => state.applyConfig);
  const setSize = useAppStore((state) => state.setSize);
  const explode = useAppStore((state) => state.explode);

  const [result, setResult] = useState<BuildResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const generation = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOrganizer = mode === 'organizer';
  const isZones = mode === 'zones';
  const activeGrid = isZones ? zonesGrid : grid;
  const activeLayer =
    organizer.layers.find((layer) => layer.id === activeLayerId) ?? organizer.layers[0];
  const organizerHeight = organizer.layers.reduce((sum, layer) => sum + layer.height, 0);
  const organizerDepth = organizer.layers.reduce((max, layer) => Math.max(max, layer.depth), 0);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6500);
  }, []);

  const currentConfig = useMemo(
    () => createConfig({ mode, params, grid, zonesGrid, organizer, zones }),
    [mode, params, grid, zonesGrid, organizer, zones],
  );

  useEffect(() => {
    const loaded = readConfigFromLocation();
    if (loaded) {
      applyConfig(loaded);
      showToast('已从分享链接载入配置。');
    }
    const onHashChange = () => {
      const next = readConfigFromLocation();
      if (next) {
        applyConfig(next);
        showToast('已从分享链接载入配置。');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [applyConfig, showToast]);

  useEffect(() => {
    let cancelled = false;
    const id = generation.current + 1;
    generation.current = id;
    setBusy(true);
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const next = await buildModel(params, activeGrid, mode, organizer, zones);
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
  }, [params, activeGrid, organizer, zones, mode, showToast]);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const handleDownload = async (split = false) => {
    setBusy(true);
    setError(null);
    try {
      const latest = await buildModel(params, activeGrid, mode, organizer, zones);
      setResult(latest);
      const exportParts = isZones
        ? split
          ? latest.zoneParts
          : latest.zoneBody
            ? [latest.zoneBody]
            : []
        : latest.parts;
      if (exportParts.length === 0) {
        throw new Error('没有可导出的几何体');
      }
      const dimensions = isZones
        ? `W${round(params.width, 1)}xD${round(params.depth, 1)}xH${round(
            latest.zonesTotalHeight,
            1,
          )}`
        : isOrganizer
          ? `W${round(params.width, 1)}xD${round(organizerDepth, 1)}xH${round(organizerHeight, 1)}`
          : `W${round(params.width, 1)}xD${round(params.depth, 1)}xH${round(
              params.height + (params.stackable ? 1 : 0),
              1,
            )}`;
      const prefix = isZones
        ? split
          ? 'bento3d-zones-parts'
          : 'bento3d-zones'
        : isOrganizer
          ? 'bento3d-organizer'
          : mode === 'set'
            ? 'bento3d-set'
            : 'bento3d-tray';
      download3mf(exportParts, `${prefix}-${dimensions}.3mf`, `Bento3D ${dimensions}mm`);
      showToast(
        isZones
          ? split
            ? `已导出 ${exportParts.length} 个分区，可在切片软件中分别摆放打印。`
            : '已导出一体成型的分区收纳盒。'
          : isOrganizer
            ? `已导出 ${latest.parts.length} 层收纳盒，共 ${latest.parts.length} 个对象。`
            : mode === 'set'
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

  const handleExportConfig = () => {
    downloadConfig(currentConfig, `bento3d-${mode}-config.json`);
    showToast('配置文件已下载，可再次导入或交给大模型继续编辑。');
  };

  const handleImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const { config, warnings } = normalizeConfig(parsed);
      applyConfig(config);
      showToast(
        warnings.length > 0 ? `已导入配置：${warnings[0]}` : '配置已导入，可继续在界面中编辑。',
      );
    } catch (importError) {
      console.error(importError);
      setError('配置文件解析失败，请确认是 Bento3D 导出的 JSON。');
    }
  };

  const handleShare = async () => {
    const url = buildShareUrl(currentConfig);
    try {
      await navigator.clipboard.writeText(url);
      showToast('分享链接已复制，打开链接即可载入当前模型。');
    } catch {
      window.prompt('复制下面的分享链接：', url);
    }
    window.history.replaceState(null, '', url.slice(Math.max(0, url.indexOf('#'))));
  };

  const boxSummary = useMemo(() => {
    if (mode !== 'set' || !result?.box) return null;
    return `收纳盒 ${round(result.box.width, 1)} × ${round(result.box.depth, 1)} × ${round(
      result.box.height,
      1,
    )} mm`;
  }, [mode, result]);

  const trayHeight = isZones
    ? (result?.zonesTotalHeight ?? zones.defaultHeight)
    : isOrganizer
      ? organizerHeight
      : (result?.tray?.height ?? params.height + (params.stackable ? 1 : 0));

  const depthValue = isOrganizer ? activeLayer.depth : params.depth;
  const heightValue = isOrganizer ? activeLayer.height : params.height;
  const changeDepth = (value: number) => {
    if (isOrganizer) updateOrganizerLayer(activeLayer.id, { depth: value });
    else setSize('depth', value);
  };
  const changeHeight = (value: number) => {
    if (isOrganizer) updateOrganizerLayer(activeLayer.id, { height: value });
    else setSize('height', value);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <BrandIcon />
          <span className="brand-name">Bento3D</span>
          <span className="brand-divider">|</span>
          <span className="brand-title">参数化收纳生成器</span>
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
          <label className="secondary-button" title="导入 JSON 配置">
            <span>导入</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="config-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImportFile(file);
                event.target.value = '';
              }}
            />
          </label>
          <button type="button" className="secondary-button" onClick={handleExportConfig} title="导出 JSON 配置">
            <span>导出配置</span>
          </button>
          <button type="button" className="secondary-button" onClick={handleShare} title="复制带配置的分享链接">
            <span>复制链接</span>
          </button>
          {isZones ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => handleDownload(true)}
              disabled={busy}
              title="每个分区导出为一个独立对象，便于分开打印"
            >
              <span>导出分区</span>
            </button>
          ) : null}
          <button type="button" className="export-button" onClick={() => handleDownload(false)} disabled={busy}>
            <DownloadIcon />
            <span>{busy ? '生成中…' : '导出 3MF'}</span>
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
                label={isOrganizer ? `第 ${organizer.layers.indexOf(activeLayer) + 1} 层深度` : '深度'}
                value={depthValue}
                position="left"
                onChange={changeDepth}
              />
              {!isZones ? (
                <DimensionHandle
                  label={isOrganizer ? `第 ${organizer.layers.indexOf(activeLayer) + 1} 层高度` : '高度'}
                  value={heightValue}
                  position="right"
                  onChange={changeHeight}
                />
              ) : null}
              <DimensionHandle
                label="宽度"
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
            <span
              className="stage-chip"
              title={params.stackable && !isOrganizer && !isZones ? '含 1 mm 堆叠唇边的总高' : undefined}
            >
              {isZones
                ? `分区盒 ${round(params.width, 1)} × ${round(params.depth, 1)} × ${round(
                    trayHeight,
                    1,
                  )} mm`
                : isOrganizer
                  ? `收纳盒 ${round(params.width, 1)} × ${round(organizerDepth, 1)} × ${round(
                      organizerHeight,
                      1,
                    )} mm`
                  : `托盘 ${round(params.width, 1)} × ${round(params.depth, 1)} × ${round(
                      trayHeight,
                      1,
                    )} mm`}
            </span>
            {isOrganizer ? (
              <span className="stage-chip">{organizer.layers.length} 层 · 可自由组合</span>
            ) : null}
            {isZones ? (
              <span className="stage-chip">
                {result?.zoneParts.length ?? 0} 个分区 · 一体成型
              </span>
            ) : null}
            {boxSummary ? <span className="stage-chip">{boxSummary}</span> : null}
            {result ? (
              <span className="stage-chip subtle">
                {result.parts.length} 个对象 · {Math.round(result.durationMs)} ms
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
