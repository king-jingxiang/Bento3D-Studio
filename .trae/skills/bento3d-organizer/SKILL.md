---
name: bento3d-organizer
description: 生成和修改 Bento3D 桌面收纳盒参数，支持两种形态：多层多分格收纳盒（每层独立深度/高度、多种外形、分格与合并），以及一体成型的「分区一体盒」（各分区独立高度与内腔形状，如圆形笔筒、牙刷/化妆刷收纳）。通过本地 MCP 输出可在网页中继续编辑的分享链接或 JSON 配置。当用户要做分层收纳盒、分格笔筒、洗手台/桌面分区收纳盒、参数化托盘组合，或要用大模型生成模型后再在界面微调时使用。
---

# Bento3D 参数化收纳盒

Bento3D 是一个纯静态的参数化 3D 模型生成网页（React + manifold-3d），部署在 GitHub Pages。
网页本身没有后端，因此大模型通过**本地 MCP 服务**或**JSON 配置**把参数交给网页，再由网页生成网格并导出 3MF。

支持两种收纳盒：

- **多层收纳盒**：多个独立层从下到上叠放，每层可不同深度、高度、外形和分格。
- **分区一体盒**：一个整体实体，按网格划出多个分区，每个分区可不同高度和内腔形状（矩形/圆角/圆/椭圆/六边形/胶囊），适合笔筒、牙刷、化妆刷、洗手台收纳。可整体打印，也可按分区导出多个对象。

## 工作流

1. 用户描述需求（尺寸、层数或分区、每层/每区高度、外形、分格）。
2. 多层需求调用 `bento3d_create_organizer`；分区一体需求调用 `bento3d_create_zone_organizer`。
3. 把 `summary`（中文摘要）和 `url` 一起展示给用户；用户点击链接即可在浏览器中看到模型。
4. 用户在网页中继续编辑（拖动分隔线、改层高/分区高度、换内腔形状、导出 3MF / JSON）。
5. 若用户又发回修改后的 JSON，调用 `bento3d_validate_config` 校验并生成新链接。

MCP 只负责参数与链接，不负责生成网格；3MF 由网页内的 manifold-3d 生成。

## 启动 MCP 服务

服务零依赖，不需要 `npm install`：

```bash
node mcp/server.mjs
```

MCP 客户端配置示例（Trae / Claude Desktop 等）：

```json
{
  "mcpServers": {
    "bento3d": {
      "command": "node",
      "args": ["D:/WorkSpace/DemoProject/Bento3D-Studio/mcp/server.mjs"]
    }
  }
}
```

工具：

- `bento3d_get_schema`：返回字段、取值范围、外形枚举和示例配置，建议先生成前调用一次。
- `bento3d_create_organizer`：按层生成配置，返回 `summary`、`warnings`、`url`、`config`。
- `bento3d_create_zone_organizer`：按分区生成一体盒配置，返回结构同上。
- `bento3d_validate_config`：校验并规范化一份完整配置，返回修正后的配置与链接。

## create_zone_organizer 参数

| 字段 | 说明 |
| --- | --- |
| `width` / `depth` | 整体宽 / 深 mm，40–300，默认 220 / 140 |
| `thickness` | 壁厚 mm，1–5，默认 2；同时作为底板厚度 |
| `fillet` | 外轮廓圆角 mm，0–8，默认 4 |
| `outline` | 整体外形：`rect` / `rounded` / `ellipse` / `hexagon` / `octagon` / `capsule` |
| `columns` / `rows` | 基础网格列 / 行数 1–12，默认 2 × 2 |
| `defaultHeight` | 未单独设置的分区默认高度 mm，8–150，默认 34 |
| `defaultShape` | 默认内腔形状，默认 `rounded` |
| `zones` | 分区数组，每项 `r0`、`c0` 必填，`r1`、`c1` 可选 |

分区字段：

- `r0` / `c0`：起始行 / 列索引（从 0 开始）
- `r1` / `c1`：结束行 / 列索引；跨多个单元格即合并为一个大分区
- `height`：该分区总高 mm，8–150
- `shape`：内腔形状 `rect` / `rounded` / `circle` / `ellipse` / `hexagon` / `capsule`

内腔形状是实际挖空的轮廓；圆形分区会按格子短边内切，形成真正的圆筒笔位；胶囊形适合长条物品。

调用示例（4 列 × 2 行的洗手台收纳盒）：

```json
{
  "width": 220,
  "depth": 140,
  "thickness": 2,
  "fillet": 4,
  "outline": "rounded",
  "columns": 4,
  "rows": 2,
  "zones": [
    { "r0": 0, "c0": 0, "height": 80, "shape": "circle" },
    { "r0": 0, "c0": 1, "height": 70, "shape": "circle" },
    { "r0": 0, "c0": 2, "height": 45, "shape": "hexagon" },
    { "r0": 0, "c0": 3, "height": 30, "shape": "capsule" },
    { "r0": 1, "c0": 0, "r1": 1, "c1": 3, "height": 30, "shape": "rounded" }
  ]
}
```

最后一行的 `r0:1,c0:0,r1:1,c1:3` 会合并成一条贯通大分区（可放牙膏、剃须刀等）。

## create_organizer 参数

| 字段 | 说明 |
| --- | --- |
| `width` | 整体宽度 mm，40–300，默认 200；所有层共用 |
| `thickness` | 壁厚 mm，1–5，默认 2 |
| `fillet` | 圆角半径 mm，0–8，默认 4 |
| `dividerInset` | 隔板低于外壁的深度 mm，0–8，默认 2 |
| `align` | `back`（靠后对齐，默认，形成阶梯台面）或 `center` |
| `baseUrl` | 部署地址，默认 `https://king-jingxiang.github.io/Bento3D-Studio/` |
| `layers` | 1–6 层，从下到上；每层 `depth`、`height` 必填 |

每层字段：

- `depth`：该层深度 mm，40–300
- `height`：该层高度 mm，8–150
- `shape`：`rect` / `rounded` / `ellipse` / `hexagon` / `octagon` / `capsule`
- `columns`、`rows`：分格数 1–12
- `merges`：可选合并区域，索引从 0 开始，如 `[{ "r0": 0, "c0": 0, "r1": 0, "c1": 1 }]`

调用示例：

```json
{
  "width": 220,
  "thickness": 2,
  "fillet": 4,
  "align": "back",
  "layers": [
    { "name": "底层", "depth": 140, "height": 32, "shape": "rounded", "columns": 2, "rows": 2 },
    { "name": "中层", "depth": 100, "height": 24, "shape": "hexagon", "columns": 3, "rows": 1 },
    { "name": "顶层", "depth": 60, "height": 18, "shape": "capsule", "columns": 1, "rows": 2 }
  ]
}
```

## 设计建议

- 靠后对齐时，上层深度逐层减小才能形成可用的阶梯台面；上层比下层更深会产生悬空（工具会给出警告）。
- 任何一层的格子小于 3 mm 都不适合打印，减少行列数或增大宽度。
- 外形为椭圆 / 六边形 / 八边形 / 胶囊形时，分格会被外形边界裁剪，靠边格子实际更小。
- 每层是独立实体，可分别打印后叠放；宽度共用，深度和高度逐层可调。
- 分区一体盒始终导出为一个整体实体；网页顶部另有「导出分区」按钮，可把每个分区导出为独立对象，便于分开打印或换色。
- 分区高度可各不相同；相邻分区共用隔板，隔板高度取较高一侧。
- 圆形内腔按单元格短边内切，格子越接近正方形越像正圆；长条物品选胶囊形。
- 3MF 导出在网页中进行；MCP 返回的链接只带参数（`#cfg=<base64url>`），不占服务器。

## 配置 JSON 格式

完整配置（网页“导出配置”得到的格式）：

```json
{
  "format": "bento3d",
  "version": 1,
  "mode": "organizer 或 zones",
  "params": { "width": 200, "thickness": 2, "fillet": 4, "...": "其余为托盘/盒子参数" },
  "grid": { "cols": [0.5, 0.5], "rows": [0.5, 0.5], "merges": [] },
  "organizer": {
    "align": "back",
    "dividerInset": 2,
    "layers": [
      {
        "id": "layer-1",
        "name": "第 1 层",
        "depth": 130,
        "height": 30,
        "shape": "rounded",
        "grid": { "cols": [0.5, 0.5], "rows": [0.5, 0.5], "merges": [] }
      }
    ]
  },
  "zones": {
    "outline": "rounded",
    "defaultHeight": 34,
    "defaultShape": "rounded",
    "styles": {
      "0-0": { "height": 80, "shape": "circle" },
      "0-1": { "height": 30, "shape": "rounded" }
    }
  }
}
```

`grid.cols` / `grid.rows` 是 0–1 的分隔比例数组（和约等于 1），`merges` 为合并区域。
`zones.styles` 以分区左上角单元格的锚点 `行-列` 为键；合并分区的锚点即其左上角。
`params` 需要保留完整字段（网页会做默认值合并，但保留可避免丢失托盘相关设置）。

## 分享链接

链接形如：

```text
https://king-jingxiang.github.io/Bento3D-Studio/#cfg=<base64url(JSON)>
```

网页启动时会读取 `#cfg=` 或 `?cfg=` 并自动载入。GitHub Pages 为纯静态托管，这是无需后端的最佳传递方式。

## 无 MCP 时的降级方案

如果当前环境不能启动 MCP，直接按上述格式输出完整 `config` JSON，让用户在网页顶部点“导入”选择该文件，或把配置写入 URL 的 `#cfg=` 参数。也可让用户先手动搭好模型，点“导出配置”把 JSON 发回来继续迭代。
