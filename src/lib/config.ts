import {
  DEFAULT_GRID,
  DEFAULT_ORGANIZER,
  DEFAULT_PARAMS,
  DEFAULT_ZONES,
  LIMITS,
  clamp,
  isAppMode,
  isOutlineShape,
  isZoneShape,
  type AppMode,
  type GridState,
  type LayerConfig,
  type OrganizerConfig,
  type Params,
  type ZoneStyle,
  type ZonesConfig,
} from '../types';
import { sanitizeGrid } from './grid';

export interface BentoConfig {
  format: 'bento3d';
  version: 1;
  mode: AppMode;
  params: Params;
  grid: GridState;
  organizer: OrganizerConfig;
  zones: ZonesConfig;
}

interface ConfigSource {
  mode: AppMode;
  params: Params;
  grid: GridState;
  organizer: OrganizerConfig;
  zones: ZonesConfig;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown, fallback: number, min: number, max: number): number =>
  clamp(typeof value === 'number' && Number.isFinite(value) ? value : fallback, min, max);

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

export function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeParams(input: unknown): Params {
  const source = isRecord(input) ? input : {};
  const d = DEFAULT_PARAMS;
  const width = num(source.width, d.width, LIMITS.width[0], LIMITS.width[1]);
  const depth = num(source.depth, d.depth, LIMITS.depth[0], LIMITS.depth[1]);
  const height = num(source.height, d.height, LIMITS.height[0], LIMITS.height[1]);
  const thickness = num(
    source.thickness,
    d.thickness,
    LIMITS.thickness[0],
    Math.min(LIMITS.thickness[1], Math.min(width, depth) / 6),
  );
  const fillet = num(
    source.fillet,
    d.fillet,
    0,
    Math.max(0, Math.min(LIMITS.fillet[1], Math.min(width, depth) / 2 - thickness - 0.5)),
  );
  const partitionHeight = num(
    source.partitionHeight,
    d.partitionHeight,
    thickness + 1,
    Math.max(thickness + 1.5, height - 0.6),
  );

  const chamfer = isRecord(source.chamfer) ? source.chamfer : {};
  const wall = isRecord(source.wall) ? source.wall : {};
  const label = isRecord(source.label) ? source.label : {};
  const finger = isRecord(source.fingerPull) ? source.fingerPull : {};
  const box = isRecord(source.box) ? source.box : {};

  return {
    width,
    depth,
    height,
    thickness,
    fillet,
    partitionHeight,
    stackable: bool(source.stackable, d.stackable),
    chamfer: {
      enabled: bool(chamfer.enabled, d.chamfer.enabled),
      size: num(chamfer.size, d.chamfer.size, LIMITS.chamfer[0], LIMITS.chamfer[1]),
    },
    wall: {
      enabled: bool(wall.enabled, d.wall.enabled),
      shape: wall.shape === 'circle' ? 'circle' : wall.shape === 'hexagon' ? 'hexagon' : d.wall.shape,
      holeSize: num(wall.holeSize, d.wall.holeSize, LIMITS.holeSize[0], LIMITS.holeSize[1]),
      margin:
        wall.margin === 'dense' || wall.margin === 'relaxed' || wall.margin === 'normal'
          ? wall.margin
          : d.wall.margin,
    },
    label: {
      enabled: bool(label.enabled, d.label.enabled),
      text: typeof label.text === 'string' ? label.text.slice(0, 16) : d.label.text,
    },
    fingerPull: {
      enabled: bool(finger.enabled, d.fingerPull.enabled),
      width: num(finger.width, d.fingerPull.width, LIMITS.fingerWidth[0], LIMITS.fingerWidth[1]),
      height: num(
        finger.height,
        d.fingerPull.height,
        LIMITS.fingerHeight[0],
        LIMITS.fingerHeight[1],
      ),
    },
    box: {
      trayCount: Math.round(
        num(box.trayCount, d.box.trayCount, LIMITS.trayCount[0], LIMITS.trayCount[1]),
      ),
      clearance: num(box.clearance, d.box.clearance, LIMITS.clearance[0], LIMITS.clearance[1]),
      lid: bool(box.lid, d.box.lid),
    },
  };
}

export function normalizeOrganizer(input: unknown, warnings: string[] = []): OrganizerConfig {
  if (!isRecord(input) || !Array.isArray(input.layers)) {
    return cloneConfig(DEFAULT_ORGANIZER);
  }

  const rawLayers = input.layers.slice(0, LIMITS.layerCount[1]);
  if (input.layers.length > LIMITS.layerCount[1]) {
    warnings.push(`收纳层数量超过 ${LIMITS.layerCount[1]} 层，已截断。`);
  }

  const usedIds = new Set<string>();
  const layers: LayerConfig[] = rawLayers.map((raw, index) => {
    const source = isRecord(raw) ? raw : {};
    let id =
      typeof source.id === 'string' && source.id.trim()
        ? source.id.trim()
        : `layer-${index + 1}`;
    while (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);

    return {
      id,
      name:
        typeof source.name === 'string' && source.name.trim()
          ? source.name.trim().slice(0, 24)
          : `第 ${index + 1} 层`,
      depth: num(source.depth, 100, LIMITS.layerDepth[0], LIMITS.layerDepth[1]),
      height: num(source.height, 24, LIMITS.layerHeight[0], LIMITS.layerHeight[1]),
      shape: isOutlineShape(source.shape) ? source.shape : 'rounded',
      grid: sanitizeGrid(isRecord(source.grid) ? (source.grid as unknown as GridState) : DEFAULT_GRID),
    };
  });

  if (layers.length === 0) {
    warnings.push('配置中没有有效的收纳层，已使用默认分层。');
    return cloneConfig(DEFAULT_ORGANIZER);
  }

  return {
    layers,
    align: input.align === 'center' ? 'center' : 'back',
    dividerInset: num(
      input.dividerInset,
      DEFAULT_ORGANIZER.dividerInset,
      LIMITS.dividerInset[0],
      LIMITS.dividerInset[1],
    ),
  };
}

export function normalizeZones(input: unknown): ZonesConfig {
  const source = isRecord(input) ? input : {};
  const rawStyles = isRecord(source.styles) ? source.styles : {};
  const styles: Record<string, ZoneStyle> = {};
  for (const [key, value] of Object.entries(rawStyles)) {
    if (!/^\d+-\d+$/.test(key) || !isRecord(value)) continue;
    styles[key] = {
      height: num(
        value.height,
        DEFAULT_ZONES.defaultHeight,
        LIMITS.zoneHeight[0],
        LIMITS.zoneHeight[1],
      ),
      shape: isZoneShape(value.shape) ? value.shape : DEFAULT_ZONES.defaultShape,
    };
  }

  return {
    outline: isOutlineShape(source.outline) ? source.outline : DEFAULT_ZONES.outline,
    defaultHeight: num(
      source.defaultHeight,
      DEFAULT_ZONES.defaultHeight,
      LIMITS.zoneHeight[0],
      LIMITS.zoneHeight[1],
    ),
    defaultShape: isZoneShape(source.defaultShape)
      ? source.defaultShape
      : DEFAULT_ZONES.defaultShape,
    styles,
  };
}

export function normalizeConfig(input: unknown): { config: BentoConfig; warnings: string[] } {
  const warnings: string[] = [];
  if (!isRecord(input)) {
    warnings.push('无法识别的配置内容，已使用默认值。');
    return {
      config: {
        format: 'bento3d',
        version: 1,
        mode: 'organizer',
        params: cloneConfig(DEFAULT_PARAMS),
        grid: cloneConfig(DEFAULT_GRID),
        organizer: cloneConfig(DEFAULT_ORGANIZER),
        zones: cloneConfig(DEFAULT_ZONES),
      },
      warnings,
    };
  }

  if (input.format !== 'bento3d') {
    warnings.push('配置缺少 Bento3D 标识，已尝试兼容导入。');
  }
  if (typeof input.version === 'number' && input.version !== 1) {
    warnings.push('配置版本与当前应用不同，已尝试兼容导入。');
  }

  const mode = isAppMode(input.mode)
    ? input.mode
    : isRecord(input.zones)
      ? 'zones'
      : isRecord(input.organizer)
        ? 'organizer'
        : 'tray';

  return {
    config: {
      format: 'bento3d',
      version: 1,
      mode,
      params: normalizeParams(input.params),
      grid: sanitizeGrid(isRecord(input.grid) ? (input.grid as unknown as GridState) : DEFAULT_GRID),
      organizer: normalizeOrganizer(input.organizer, mode === 'organizer' ? warnings : []),
      zones: normalizeZones(input.zones),
    },
    warnings,
  };
}

export function createConfig(source: ConfigSource): BentoConfig {
  return {
    format: 'bento3d',
    version: 1,
    mode: source.mode,
    params: cloneConfig(source.params),
    grid: cloneConfig(source.grid),
    organizer: cloneConfig(source.organizer),
    zones: cloneConfig(source.zones),
  };
}

export function encodeConfig(config: BentoConfig): string {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeConfigToken(token: string): BentoConfig | null {
  try {
    const normalized = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return normalizeConfig(JSON.parse(json)).config;
  } catch {
    return null;
  }
}

export function readConfigFromLocation(): BentoConfig | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  let token = '';
  if (hash.startsWith('cfg=')) {
    token = hash.slice(4);
  } else {
    token = new URLSearchParams(window.location.search).get('cfg') ?? '';
  }
  return token ? decodeConfigToken(token) : null;
}

export function buildShareUrl(config: BentoConfig): string {
  if (typeof window === 'undefined') return '';
  const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  return `${base}#cfg=${encodeConfig(config)}`;
}

export function downloadConfig(config: BentoConfig, filename = 'bento3d-config.json') {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
