# Bento3D MCP Server

零依赖的本地 MCP（stdio）服务，让大模型生成 Bento3D 收纳盒参数（多层收纳盒或一体成型的多分区收纳盒），并产出可在网页中打开编辑的分享链接。

## 运行

```bash
node mcp/server.mjs
```

无需 `npm install`，Node.js 18+。

## 接入 MCP 客户端

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

Windows 路径建议使用正斜杠。配置到 Trae / Claude Desktop 等客户端的 MCP 设置后重启客户端。

## 工具

| 工具 | 作用 |
| --- | --- |
| `bento3d_get_schema` | 获取配置字段、取值范围、外形枚举、示例 |
| `bento3d_create_organizer` | 按层生成多层收纳盒配置与分享链接 |
| `bento3d_create_zone_organizer` | 按分区生成一体成型的分区收纳盒配置与分享链接 |
| `bento3d_validate_config` | 校验 / 规范化一份完整配置，返回摘要与链接 |

`bento3d_create_zone_organizer` 用基础网格 + 分区索引描述布局：`columns` / `rows` 划网格，`zones` 中的 `r0/c0/r1/c1` 指定每个分区占据的单元格（跨格即合并），每个分区可独立设置 `height` 和 `shape`（`rect` / `rounded` / `circle` / `ellipse` / `hexagon` / `capsule`）。

`bento3d_create_organizer` 返回：

```json
{
  "summary": "多层收纳盒：宽 220 mm，共 3 层，总高 74 mm……",
  "warnings": [],
  "url": "https://king-jingxiang.github.io/Bento3D-Studio/#cfg=...",
  "config": { "format": "bento3d", "version": 1, "mode": "organizer", "...": "..." }
}
```

## 设计说明

- 网页是 GitHub Pages 纯静态站点，没有后端；配置全部编码进 URL 的 `#cfg=`（base64url），因此链接不依赖服务器。
- MCP 不生成网格；网页中的 manifold-3d 根据配置生成几何并导出 3MF。
- 分区一体盒在网页中默认导出单个一体模型，也可点「导出分区」把每个分区导出为独立对象。
- `mcp/config.mjs` 与 `src/lib/config.ts` 保持一致，修改字段时需同步更新两处。
- 分享链接的部署地址通过 `baseUrl` 参数覆盖，默认 `https://king-jingxiang.github.io/Bento3D-Studio/`。

更完整的使用说明见 [`.trae/skills/bento3d-organizer/SKILL.md`](../.trae/skills/bento3d-organizer/SKILL.md)。
