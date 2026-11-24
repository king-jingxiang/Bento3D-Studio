#!/usr/bin/env node
// Bento3D MCP server (stdio, zero dependencies).
// Start with: node mcp/server.mjs
import { createInterface } from 'node:readline';
import {
  DEFAULT_BASE_URL,
  LIMITS,
  OUTLINE_LABELS,
  OUTLINE_SHAPES,
  ZONE_LABELS,
  ZONE_SHAPES,
  buildShareUrl,
  configFromOrganizerInput,
  configFromZonesInput,
  normalizeConfig,
  summarizeConfig,
} from './config.mjs';

const SERVER = { name: 'bento3d-organizer', version: '1.0.0' };
const DEFAULT_PROTOCOL = '2025-06-18';

const TOOLS = [
  {
    name: 'bento3d_get_schema',
    description:
      '获取 Bento3D 收纳盒配置格式说明（字段、取值范围、外形枚举、示例）。在生成配置前先调用一次即可。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'bento3d_create_organizer',
    description:
      '根据多层参数生成 Bento3D 多层收纳盒配置，并返回可直接在浏览器打开的分享链接。用户可在网页中继续编辑、导出 3MF。',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number', description: '整体宽度 mm，40-300，默认 200' },
        thickness: { type: 'number', description: '壁厚 mm，1-5，默认 2' },
        fillet: { type: 'number', description: '圆角半径 mm，0-8，默认 4' },
        dividerInset: { type: 'number', description: '隔板低于外壁 mm，0-8，默认 2' },
        align: { type: 'string', enum: ['back', 'center'], description: '层对齐方式，默认 back' },
        baseUrl: {
          type: 'string',
          description: `部署地址，默认 ${DEFAULT_BASE_URL}`,
        },
        layers: {
          type: 'array',
          minItems: 1,
          maxItems: LIMITS.layerCount[1],
          description: '收纳层，从下到上排列；每层可独立设置深度、高度、外形与分格',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '层名称，可选' },
              depth: { type: 'number', description: '该层深度 mm，40-300' },
              height: { type: 'number', description: '该层高度 mm，8-150' },
              shape: {
                type: 'string',
                enum: OUTLINE_SHAPES,
                description: '该层外形，默认 rounded',
              },
              columns: { type: 'number', description: '列数 1-12，默认 1' },
              rows: { type: 'number', description: '行数 1-12，默认 1' },
              merges: {
                type: 'array',
                description:
                  '可选合并区域，索引从 0 开始：{r0,c0,r1,c1}',
                items: {
                  type: 'object',
                  properties: {
                    r0: { type: 'number' },
                    c0: { type: 'number' },
                    r1: { type: 'number' },
                    c1: { type: 'number' },
                  },
                  required: ['r0', 'c0', 'r1', 'c1'],
                },
              },
            },
            required: ['depth', 'height'],
          },
        },
      },
      required: ['layers'],
    },
  },
  {
    name: 'bento3d_create_zone_organizer',
    description:
      '根据分区参数生成 Bento3D「分区一体盒」配置：整体一体成型，各分区可独立设置高度与内腔形状（圆形、六边形等），并返回可直接在浏览器打开的分享链接。适合笔筒、牙刷/化妆刷、洗手台收纳等。',
    inputSchema: {
      type: 'object',
      properties: {
        width: { type: 'number', description: '整体宽度 mm，40-300，默认 220' },
        depth: { type: 'number', description: '整体深度 mm，40-300，默认 140' },
        thickness: { type: 'number', description: '壁厚 mm，1-5，默认 2' },
        fillet: { type: 'number', description: '外轮廓圆角 mm，0-8，默认 4' },
        outline: {
          type: 'string',
          enum: OUTLINE_SHAPES,
          description: '整体外形，默认 rounded；只影响外轮廓',
        },
        columns: { type: 'number', description: '基础网格列数 1-12，默认 2' },
        rows: { type: 'number', description: '基础网格行数 1-12，默认 2' },
        defaultHeight: { type: 'number', description: '未指定分区的默认高度 mm，默认 34' },
        defaultShape: {
          type: 'string',
          enum: ZONE_SHAPES,
          description: '未指定分区的默认内腔形状，默认 rounded',
        },
        zones: {
          type: 'array',
          minItems: 1,
          description:
            '分区列表。r0/c0/r1/c1 为基础网格索引（从 0 开始，包含端点）；跨多个单元格即形成一个合并分区。锚点为左上角 r0-c0。',
          items: {
            type: 'object',
            properties: {
              r0: { type: 'number', description: '起始行索引' },
              c0: { type: 'number', description: '起始列索引' },
              r1: { type: 'number', description: '结束行索引，可选，默认等于 r0' },
              c1: { type: 'number', description: '结束列索引，可选，默认等于 c0' },
              height: { type: 'number', description: '该分区总高 mm，8-150' },
              shape: {
                type: 'string',
                enum: ZONE_SHAPES,
                description: '内腔形状，默认 rounded；圆形适合笔/刷子竖放',
              },
            },
            required: ['r0', 'c0'],
          },
        },
        baseUrl: {
          type: 'string',
          description: `部署地址，默认 ${DEFAULT_BASE_URL}`,
        },
      },
      required: ['zones'],
    },
  },
  {
    name: 'bento3d_validate_config',
    description:
      '校验并规范化一份 Bento3D 配置 JSON，返回修正后的配置、摘要与警告。可先用它检查大模型手写的配置。',
    inputSchema: {
      type: 'object',
      properties: {
        config: { type: 'object', description: '完整的 bento3d 配置对象' },
      },
      required: ['config'],
    },
  },
];

function textResult(payload, isError = false) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text }], isError };
}

const SCHEMA_DOC = {
  format: 'bento3d',
  version: 1,
  mode: 'tray | set | organizer | zones（分区一体盒）',
  unit: 'mm',
  coordinateNotes: 'layers 从下到上排列；靠后对齐时各层后沿对齐，深度逐层减小形成阶梯。',
  shapeEnum: OUTLINE_SHAPES.map((value) => ({ value, label: OUTLINE_LABELS[value] })),
  zoneShapeEnum: ZONE_SHAPES.map((value) => ({ value, label: ZONE_LABELS[value] })),
  limits: LIMITS,
  zonesNotes:
    '分区一体盒只有一个实体：整体底板 + 各分区隔板与内腔，一次打印。zone 的 r0/c0/r1/c1 是基础网格索引，跨格即合并为一个大分区；styles 以左上角锚点 row-col 存储。',
  zonesExample: {
    mode: 'zones',
    params: {
      width: 220,
      depth: 140,
      height: 80,
      thickness: 2,
      fillet: 4,
    },
    grid: {
      cols: [0.25, 0.25, 0.25, 0.25],
      rows: [0.5, 0.5],
      merges: [],
    },
    zones: {
      outline: 'rounded',
      defaultHeight: 34,
      defaultShape: 'rounded',
      styles: {
        '0-0': { height: 80, shape: 'circle' },
        '0-1': { height: 70, shape: 'circle' },
        '0-2': { height: 45, shape: 'hexagon' },
        '0-3': { height: 30, shape: 'capsule' },
        '1-0': { height: 34, shape: 'rounded' },
        '1-1': { height: 34, shape: 'rounded' },
        '1-2': { height: 34, shape: 'rounded' },
        '1-3': { height: 34, shape: 'rounded' },
      },
    },
  },
  configExample: {
    format: 'bento3d',
    version: 1,
    mode: 'organizer',
    params: {
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
    },
    grid: { cols: [0.5, 0.5], rows: [0.5, 0.5], merges: [] },
    organizer: {
      align: 'back',
      dividerInset: 2,
      layers: [
        {
          id: 'layer-1',
          name: '第 1 层',
          depth: 130,
          height: 30,
          shape: 'rounded',
          grid: { cols: [0.5, 0.5], rows: [0.5, 0.5], merges: [] },
        },
      ],
    },
  },
  workflow: [
    '1. 多层收纳盒调用 bento3d_create_organizer；分区一体盒调用 bento3d_create_zone_organizer。',
    '2. 把 summary 和 url 展示给用户；用户在浏览器打开链接即可看到模型。',
    '3. 用户在网页中修改后可导出 JSON 配置，再调用 bento3d_validate_config 继续迭代。',
    '4. 网页是纯静态站点（GitHub Pages），没有后端；配置通过 URL #cfg= 传递。',
  ],
};

async function callTool(name, args) {
  if (name === 'bento3d_get_schema') {
    return textResult(SCHEMA_DOC);
  }

  if (name === 'bento3d_create_organizer') {
    const { config, warnings } = configFromOrganizerInput(args ?? {});
    const url = buildShareUrl(config, args?.baseUrl);
    return textResult({
      summary: summarizeConfig(config),
      warnings,
      url,
      config,
    });
  }

  if (name === 'bento3d_create_zone_organizer') {
    const { config, warnings } = configFromZonesInput(args ?? {});
    const url = buildShareUrl(config, args?.baseUrl);
    return textResult({
      summary: summarizeConfig(config),
      warnings,
      url,
      config,
    });
  }

  if (name === 'bento3d_validate_config') {
    if (!args || typeof args !== 'object' || !('config' in args)) {
      throw new Error('缺少 config 参数。');
    }
    const { config, warnings } = normalizeConfig(args.config);
    const url = buildShareUrl(config, args.baseUrl);
    return textResult({
      valid: true,
      summary: summarizeConfig(config),
      warnings,
      url,
      config,
    });
  }

  throw new Error(`未知工具：${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleMessage(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;

  if (method === 'initialize') {
    if (!isRequest) return;
    sendResult(id, {
      protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER,
      instructions:
        'Bento3D 收纳盒生成器，支持多层收纳盒与分区一体盒。先用 bento3d_get_schema 了解格式，再调用 bento3d_create_organizer 或 bento3d_create_zone_organizer 生成配置与网页链接。',
    });
    return;
  }

  if (method === 'tools/list') {
    if (!isRequest) return;
    sendResult(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    if (!isRequest) return;
    const name = params?.name;
    if (!name) {
      sendError(id, -32602, '缺少工具名称。');
      return;
    }
    try {
      const result = await callTool(name, params?.arguments ?? {});
      sendResult(id, result);
    } catch (error) {
      sendResult(id, textResult(`错误：${error.message}`, true));
    }
    return;
  }

  if (method === 'ping') {
    if (isRequest) sendResult(id, {});
    return;
  }

  if (method === 'resources/list') {
    if (isRequest) sendResult(id, { resources: [] });
    return;
  }

  if (method === 'prompts/list') {
    if (isRequest) sendResult(id, { prompts: [] });
    return;
  }

  // Notifications (initialized, cancelled, ...) need no response.
  if (!isRequest) return;
  sendError(id, -32601, `不支持的方法：${method}`);
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    process.stderr.write('[bento3d] 收到无法解析的消息\n');
    return;
  }
  handleMessage(message).catch((error) => {
    process.stderr.write(`[bento3d] 处理消息失败：${error.stack || error}\n`);
    if (message?.id !== undefined) {
      sendError(message.id, -32603, error.message);
    }
  });
});

process.stderr.write('[bento3d] MCP server 已启动（stdio）\n');
