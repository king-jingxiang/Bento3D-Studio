// Shared configuration logic for the Bento3D MCP server.
// Zero dependencies: mirrors src/lib/config.ts so the web app and MCP agree on the format.

export const FORMAT = 'bento3d';
export const VERSION = 1;
export const DEFAULT_BASE_URL = 'https://king-jingxiang.github.io/Bento3D-Studio/';

export const LIMITS = {
  width: [40, 300],
  depth: [40, 300],
  height: [8, 120],
  thickness: [1, 5],
  fillet: [0, 8],
  layerCount: [1, 6],
  layerDepth: [40, 300],
  layerHeight: [8, 150],
  zoneHeight: [8, 150],
  dividerInset: [0, 8],
  columns: [1, 12],
  rows: [1, 12],
};

export const OUTLINE_SHAPES = ['rect', 'rounded', 'ellipse', 'hexagon', 'octagon', 'capsule'];
export const OUTLINE_LABELS = {
  rect: '方形',
  rounded: '圆角',
  ellipse: '椭圆',
  hexagon: '六边形',
  octagon: '八边形',
  capsule: '胶囊形',
};

export const ZONE_SHAPES = ['rect', 'rounded', 'circle', 'ellipse', 'hexagon', 'capsule'];
export const ZONE_LABELS = {
  rect: '矩形',
  rounded: '圆角矩形',
  circle: '圆形',
  ellipse: '椭圆',
  hexagon: '六边形',
  capsule: '胶囊形',
};

export const DEFAULT_PARAMS = {
  width: 200,
  depth: 130,
  height: 24,
  thickness: 2,
  fillet: 4,
  partitionHeight: 20,
  stackable: false,
  chamfer: { enabled: false, size: 0.8 },
  wall: { enabled: false, shape: 'hexagon', holeSize: 3, margin: 'normal' },
  label: { enabled: false, text: 'BENTO' },
  fingerPull: { enabled: false, width: 20, height: 10 },
  box: { trayCount: 1, clearance: 0.4, lid: true },
};

export const DEFAULT_GRID = {
  cols: [0.5, 0.5],
  rows: [0.5, 0.5],
  merges: [],
};

export const DEFAULT_ZONES = {
  outline: 'rounded',
  defaultHeight: 34,
  defaultShape: 'rounded',
  styles: {},
};

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const round = (value) => Math.round(value * 10) / 10;

export function evenGrid(columns, rows) {
  const cols = Math.round(clamp(columns || 1, LIMITS.columns[0], LIMITS.columns[1]));
  const rws = Math.round(clamp(rows || 1, LIMITS.rows[0], LIMITS.rows[1]));
  return {
    cols: Array.from({ length: cols }, () => 1 / cols),
    rows: Array.from({ length: rws }, () => 1 / rws),
    merges: [],
  };
}

const clampRect = (rect, rowCount, colCount) => {
  const r0 = Math.max(0, Math.min(rect.r0, rect.r1));
  const r1 = Math.min(rowCount - 1, Math.max(rect.r0, rect.r1));
  const c0 = Math.max(0, Math.min(rect.c0, rect.c1));
  const c1 = Math.min(colCount - 1, Math.max(rect.c0, rect.c1));
  if (r0 > r1 || c0 > c1) return null;
  return { r0, c0, r1, c1 };
};

export function sanitizeGrid(raw) {
  const grid = isRecord(raw) ? raw : {};
  const cols = Array.isArray(grid.cols) && grid.cols.length > 0 ? grid.cols : [1];
  const rows = Array.isArray(grid.rows) && grid.rows.length > 0 ? grid.rows : [1];
  const normalize = (values) => {
    const safe = values
      .slice(0, LIMITS.columns[1])
      .map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0));
    const sum = safe.reduce((total, value) => total + value, 0);
    return sum > 0 ? safe.map((value) => value / sum) : safe.map(() => 1 / safe.length);
  };
  const normalized = { cols: normalize(cols), rows: normalize(rows) };
  const merges = Array.isArray(grid.merges)
    ? grid.merges
        .filter(isRecord)
        .map((merge) => clampRect(merge, normalized.rows.length, normalized.cols.length))
        .filter(
          (merge) => merge && !(merge.r0 === merge.r1 && merge.c0 === merge.c1),
        )
    : [];
  return { ...normalized, merges };
}

export function normalizeParams(raw) {
  const source = isRecord(raw) ? raw : {};
  const d = DEFAULT_PARAMS;
  const num = (value, fallback, min, max) =>
    clamp(typeof value === 'number' && Number.isFinite(value) ? value : fallback, min, max);
  const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

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
    partitionHeight: num(source.partitionHeight, d.partitionHeight, thickness + 1, Math.max(thickness + 1.5, height - 0.6)),
    stackable: bool(source.stackable, d.stackable),
    chamfer: {
      enabled: bool(chamfer.enabled, d.chamfer.enabled),
      size: num(chamfer.size, d.chamfer.size, 0.2, 2),
    },
    wall: {
      enabled: bool(wall.enabled, d.wall.enabled),
      shape: wall.shape === 'circle' ? 'circle' : wall.shape === 'hexagon' ? 'hexagon' : d.wall.shape,
      holeSize: num(wall.holeSize, d.wall.holeSize, 3, 12),
      margin: ['dense', 'normal', 'relaxed'].includes(wall.margin) ? wall.margin : d.wall.margin,
    },
    label: {
      enabled: bool(label.enabled, d.label.enabled),
      text: typeof label.text === 'string' ? label.text.slice(0, 16) : d.label.text,
    },
    fingerPull: {
      enabled: bool(finger.enabled, d.fingerPull.enabled),
      width: num(finger.width, d.fingerPull.width, 10, 80),
      height: num(finger.height, d.fingerPull.height, 6, 30),
    },
    box: {
      trayCount: Math.round(num(box.trayCount, d.box.trayCount, 1, 6)),
      clearance: num(box.clearance, d.box.clearance, 0.2, 1.2),
      lid: bool(box.lid, d.box.lid),
    },
  };
}

export function normalizeOrganizer(raw, warnings = []) {
  if (!isRecord(raw) || !Array.isArray(raw.layers) || raw.layers.length === 0) {
    warnings.push('缺少 organizer.layers，已生成一个默认收纳层。');
    return defaultOrganizer();
  }

  if (raw.layers.length > LIMITS.layerCount[1]) {
    warnings.push(`收纳层超过 ${LIMITS.layerCount[1]} 层，已截断。`);
  }
  const rawLayers = raw.layers.slice(0, LIMITS.layerCount[1]);
  const usedIds = new Set();

  const layers = rawLayers.map((layer, index) => {
    const source = isRecord(layer) ? layer : {};
    let id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : `layer-${index + 1}`;
    while (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);
    return {
      id,
      name:
        typeof source.name === 'string' && source.name.trim()
          ? source.name.trim().slice(0, 24)
          : `第 ${index + 1} 层`,
      depth: clamp(
        typeof source.depth === 'number' && Number.isFinite(source.depth) ? source.depth : 100,
        LIMITS.layerDepth[0],
        LIMITS.layerDepth[1],
      ),
      height: clamp(
        typeof source.height === 'number' && Number.isFinite(source.height) ? source.height : 24,
        LIMITS.layerHeight[0],
        LIMITS.layerHeight[1],
      ),
      shape: OUTLINE_SHAPES.includes(source.shape) ? source.shape : 'rounded',
      grid: sanitizeGrid(source.grid ?? evenGrid(1, 1)),
    };
  });

  return {
    layers,
    align: raw.align === 'center' ? 'center' : 'back',
    dividerInset: clamp(
      typeof raw.dividerInset === 'number' && Number.isFinite(raw.dividerInset)
        ? raw.dividerInset
        : 2,
      LIMITS.dividerInset[0],
      LIMITS.dividerInset[1],
    ),
  };
}

export function defaultOrganizer() {
  const make = (index, depth, height, shape, columns, rows) => ({
    id: `layer-${index + 1}`,
    name: `第 ${index + 1} 层`,
    depth,
    height,
    shape,
    grid: evenGrid(columns, rows),
  });
  return {
    align: 'back',
    dividerInset: 2,
    layers: [
      make(0, 130, 30, 'rounded', 2, 2),
      make(1, 95, 24, 'rounded', 3, 1),
      make(2, 60, 20, 'rounded', 1, 2),
    ],
  };
}

export function normalizeZones(raw) {
  const source = isRecord(raw) ? raw : {};
  const defaultHeight = clamp(
    typeof source.defaultHeight === 'number' && Number.isFinite(source.defaultHeight)
      ? source.defaultHeight
      : DEFAULT_ZONES.defaultHeight,
    LIMITS.zoneHeight[0],
    LIMITS.zoneHeight[1],
  );
  const defaultShape = ZONE_SHAPES.includes(source.defaultShape)
    ? source.defaultShape
    : DEFAULT_ZONES.defaultShape;
  const styles = {};
  const rawStyles = isRecord(source.styles) ? source.styles : {};
  for (const [key, value] of Object.entries(rawStyles)) {
    if (!/^\d+-\d+$/.test(key) || !isRecord(value)) continue;
    styles[key] = {
      height: clamp(
        typeof value.height === 'number' && Number.isFinite(value.height)
          ? value.height
          : defaultHeight,
        LIMITS.zoneHeight[0],
        LIMITS.zoneHeight[1],
      ),
      shape: ZONE_SHAPES.includes(value.shape) ? value.shape : defaultShape,
    };
  }

  return {
    outline: OUTLINE_SHAPES.includes(source.outline) ? source.outline : DEFAULT_ZONES.outline,
    defaultHeight,
    defaultShape,
    styles,
  };
}

export function normalizeConfig(raw) {
  const warnings = [];
  if (!isRecord(raw)) {
    warnings.push('配置不是有效的 JSON 对象，已使用默认值。');
    return {
      config: {
        format: FORMAT,
        version: VERSION,
        mode: 'organizer',
        params: DEFAULT_PARAMS,
        grid: DEFAULT_GRID,
        organizer: defaultOrganizer(),
        zones: { ...DEFAULT_ZONES, styles: {} },
      },
      warnings,
    };
  }

  if (raw.format !== FORMAT) warnings.push('配置缺少 bento3d 标识。');
  if (typeof raw.version === 'number' && raw.version !== VERSION) {
    warnings.push('配置版本与当前版本不同，已尝试兼容。');
  }
  const mode =
    raw.mode === 'tray' || raw.mode === 'set' || raw.mode === 'organizer' || raw.mode === 'zones'
      ? raw.mode
      : isRecord(raw.zones)
        ? 'zones'
        : isRecord(raw.organizer)
          ? 'organizer'
          : 'tray';

  return {
    config: {
      format: FORMAT,
      version: VERSION,
      mode,
      params: normalizeParams(raw.params),
      grid: sanitizeGrid(raw.grid ?? DEFAULT_GRID),
      organizer: normalizeOrganizer(raw.organizer, warnings),
      zones: normalizeZones(raw.zones),
    },
    warnings,
  };
}

export function configFromOrganizerInput(input) {
  const source = isRecord(input) ? input : {};
  const warnings = [];
  const rawLayers = Array.isArray(source.layers) ? source.layers : [];
  if (rawLayers.length === 0) {
    throw new Error('layers 不能为空，至少需要 1 个收纳层。');
  }
  if (rawLayers.length > LIMITS.layerCount[1]) {
    warnings.push(`最多 ${LIMITS.layerCount[1]} 层，多余层已忽略。`);
  }

  const params = normalizeParams({
    width: source.width ?? DEFAULT_PARAMS.width,
    thickness: source.thickness ?? DEFAULT_PARAMS.thickness,
    fillet: source.fillet ?? DEFAULT_PARAMS.fillet,
    depth: Math.max(...rawLayers.map((layer) => Number(layer?.depth) || 100)),
    height: Number(rawLayers[0]?.height) || DEFAULT_PARAMS.height,
  });

  const layers = rawLayers.slice(0, LIMITS.layerCount[1]).map((layer, index) => {
    const item = isRecord(layer) ? layer : {};
    const grid = isRecord(item.grid)
      ? sanitizeGrid(item.grid)
      : (() => {
          const base = evenGrid(item.columns ?? 1, item.rows ?? 1);
          if (Array.isArray(item.merges)) {
            return sanitizeGrid({ ...base, merges: item.merges });
          }
          return base;
        })();

    return {
      id: `layer-${index + 1}`,
      name:
        typeof item.name === 'string' && item.name.trim()
          ? item.name.trim().slice(0, 24)
          : `第 ${index + 1} 层`,
      depth: clamp(
        typeof item.depth === 'number' && Number.isFinite(item.depth) ? item.depth : 100,
        LIMITS.layerDepth[0],
        LIMITS.layerDepth[1],
      ),
      height: clamp(
        typeof item.height === 'number' && Number.isFinite(item.height) ? item.height : 24,
        LIMITS.layerHeight[0],
        LIMITS.layerHeight[1],
      ),
      shape: OUTLINE_SHAPES.includes(item.shape) ? item.shape : 'rounded',
      grid,
    };
  });

  const organizer = {
    layers,
    align: source.align === 'center' ? 'center' : 'back',
    dividerInset: clamp(
      typeof source.dividerInset === 'number' && Number.isFinite(source.dividerInset)
        ? source.dividerInset
        : 2,
      LIMITS.dividerInset[0],
      LIMITS.dividerInset[1],
    ),
  };

  return {
    config: {
      format: FORMAT,
      version: VERSION,
      mode: 'organizer',
      params,
      grid: DEFAULT_GRID,
      organizer,
      zones: { ...DEFAULT_ZONES, styles: {} },
    },
    warnings,
  };
}

export function configFromZonesInput(input) {
  const source = isRecord(input) ? input : {};
  const warnings = [];
  const columns = Math.round(
    clamp(Number(source.columns) || 2, LIMITS.columns[0], LIMITS.columns[1]),
  );
  const rows = Math.round(clamp(Number(source.rows) || 2, LIMITS.rows[0], LIMITS.rows[1]));
  const rawZones = Array.isArray(source.zones) ? source.zones : [];
  if (rawZones.length === 0) {
    throw new Error('zones 不能为空，至少需要 1 个分区。');
  }

  const defaultShape = ZONE_SHAPES.includes(source.defaultShape)
    ? source.defaultShape
    : DEFAULT_ZONES.defaultShape;
  const defaultHeight = clamp(
    Number(source.defaultHeight) || DEFAULT_ZONES.defaultHeight,
    LIMITS.zoneHeight[0],
    LIMITS.zoneHeight[1],
  );

  const merges = [];
  const styles = {};
  for (const zone of rawZones) {
    if (!isRecord(zone)) continue;
    const r0 = Math.round(clamp(Number(zone.r0) || 0, 0, rows - 1));
    const c0 = Math.round(clamp(Number(zone.c0) || 0, 0, columns - 1));
    const r1 = Math.round(clamp(Number(zone.r1) ?? r0, r0, rows - 1));
    const c1 = Math.round(clamp(Number(zone.c1) ?? c0, c0, columns - 1));
    const key = `${r0}-${c0}`;
    if (styles[key]) {
      warnings.push(`分区锚点 ${key} 重复，后者覆盖前者。`);
    }
    styles[key] = {
      height: clamp(
        Number(zone.height) || defaultHeight,
        LIMITS.zoneHeight[0],
        LIMITS.zoneHeight[1],
      ),
      shape: ZONE_SHAPES.includes(zone.shape) ? zone.shape : defaultShape,
    };
    if (r1 > r0 || c1 > c0) merges.push({ r0, c0, r1, c1 });
  }

  if (Object.keys(styles).length === 0) {
    throw new Error('zones 中没有有效分区，请检查 r0/c0/r1/c1。');
  }

  const zones = normalizeZones({
    outline: source.outline,
    defaultHeight,
    defaultShape,
    styles,
  });
  const tallest = Math.max(
    zones.defaultHeight,
    ...Object.values(zones.styles).map((style) => style.height),
  );
  const params = normalizeParams({
    width: source.width ?? 220,
    depth: source.depth ?? 140,
    height: tallest,
    thickness: source.thickness ?? 2,
    fillet: source.fillet ?? 4,
  });

  return {
    config: {
      format: FORMAT,
      version: VERSION,
      mode: 'zones',
      params,
      grid: sanitizeGrid({ ...evenGrid(columns, rows), merges }),
      organizer: defaultOrganizer(),
      zones,
    },
    warnings,
  };
}

export function summarizeConfig(config) {
  if (config.mode === 'zones') {
    const zones = config.zones ?? normalizeZones();
    const height = Math.max(
      zones.defaultHeight,
      ...Object.values(zones.styles).map((style) => style.height),
    );
    const grid = config.grid;
    let cellCount = grid.cols.length * grid.rows.length;
    for (const merge of grid.merges) {
      cellCount -= (merge.r1 - merge.r0 + 1) * (merge.c1 - merge.c0 + 1) - 1;
    }
    const lines = [
      `分区一体盒：宽 ${round(config.params.width)} × 深 ${round(
        config.params.depth,
      )} mm，${cellCount} 个分区，最高 ${round(height)} mm，整体${
        OUTLINE_LABELS[zones.outline]
      }外形，一体成型。`,
    ];
    Object.entries(zones.styles).forEach(([key, style], index) => {
      lines.push(
        `分区 ${index + 1}（锚点 ${key}） 高 ${round(style.height)} mm · ${
          ZONE_LABELS[style.shape]
        }内腔`,
      );
    });
    return lines.join('\n');
  }

  const layers = config.organizer.layers;
  const totalHeight = layers.reduce((sum, layer) => sum + layer.height, 0);
  const maxDepth = layers.reduce((max, layer) => Math.max(max, layer.depth), 0);
  const lines = [
    `多层收纳盒：宽 ${round(config.params.width)} mm，共 ${layers.length} 层，总高 ${round(
      totalHeight,
    )} mm，最深 ${round(maxDepth)} mm。`,
  ];
  layers.forEach((layer, index) => {
    lines.push(
      `第 ${index + 1} 层「${layer.name}」 ${round(layer.depth)}×${round(
        layer.height,
      )} mm · ${OUTLINE_LABELS[layer.shape]} · ${layer.grid.cols.length}×${
        layer.grid.rows.length
      } 格`,
    );
  });
  return lines.join('\n');
}

export function encodeConfig(config) {
  return Buffer.from(JSON.stringify(config), 'utf8').toString('base64url');
}

export function buildShareUrl(config, baseUrl = DEFAULT_BASE_URL) {
  const base = String(baseUrl || DEFAULT_BASE_URL).replace(/#.*$/, '').trim();
  return `${base}#cfg=${encodeConfig(config)}`;
}
