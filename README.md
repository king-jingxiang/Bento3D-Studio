# Bento3D Studio

简体中文 | [English](README.en.md)

[![Deploy to GitHub Pages](https://github.com/king-jingxiang/Bento3D-Studio/actions/workflows/deploy.yml/badge.svg)](https://github.com/king-jingxiang/Bento3D-Studio/actions/workflows/deploy.yml)

参数化 3D 打印收纳生成器。在浏览器中调整尺寸、划分隔板、添加墙面孔洞与标签，实时预览模型，并一键导出可直接打印的 3MF 文件。新增多分区、多分格的桌面收纳盒参数化生成，支持每层独立深度与高度、多种外形自由组合。

- 在线体验：<https://king-jingxiang.github.io/Bento3D-Studio/>
- 源码仓库：<https://github.com/king-jingxiang/Bento3D-Studio>

## 功能特性

### 多层桌面收纳盒

- 在左侧模式中选择“多层收纳盒”，支持 1–6 层自由组合。
- 每层可独立设置深度、高度、外形与分格，层与层之间靠后对齐形成阶梯台面。
- 内置方形、圆角、椭圆、六边形、八边形、胶囊形六种外轮廓；非矩形外轮廓会自动裁剪分格。
- 每层可单独使用预设或自定义高度，隔板相对外壁下沉，便于取放物品。
- 每层为独立实体，可分别打印后叠放；也可在界面中继续调整并导出 3MF。

### 参数化尺寸

- 宽度、深度、高度支持在画布标注上直接调节，也可在左侧面板输入精确数值（单位 mm）。
- 可调壁厚、外轮廓圆角与隔板高度，并可开关顶部堆叠唇边。
- 所有参数在 `src/types.ts` 中定义取值范围，输入时自动收敛到安全区间。

### 隔板网格编辑

- 内置“尺寸 / 分区 / 预览”三个视图。
- 在“分区”视图中拖拽分隔线即可调整行、列比例，双击分隔线删除该分隔。
- 支持 1×1、2×2、3×3 快捷预设，也可自由添加行、列；多层模式下编辑当前选中层。
- 点击单元格选择，`Shift` / `Ctrl` / `Cmd` 可多选后合并；已合并的单元格可再次拆分。

### 墙面花纹与细节

- 墙面镂空：六边形或圆形，可调孔径与孔间距密度（密集 / 标准 / 宽松）。
- 标签浮雕：在前壁生成 0.7 mm 高的凸起文字，最多 16 个字符。
- 手指扣：在前壁生成取物缺口，宽度与高度可调。

### 托盘 + 收纳盒套装

- 切换到“托盘 + 收纳盒”模式后，会按可叠放托盘数量生成收纳盒。
- 支持托盘与盒壁之间的单边间隙、卡扣式盖子，以及用于观察装配关系的爆炸视图滑杆。
- 3MF 中导出托盘、收纳盒、盖子共 3 个对象（托盘只需打印一次并按需复制）。

### 实时几何与导出

- 使用 `manifold-3d`（WASM）在浏览器本地完成布尔运算，参数变化后自动重建几何。
- 所有计算均在本地执行，模型不会上传到任何服务器。
- 一键导出 3MF：自动将零件排版到 220 mm 宽的打印区域（间距 8 mm），可直接导入 Bambu Studio、OrcaSlicer 或其他切片软件。
- 文件名自动附带整体尺寸，例如 `bento3d-tray-W100xD100xH20.3mf`。

### 配置与 AI 生成

- 界面顶部支持“导入 / 导出配置”和“复制链接”，配置为带版本号的 JSON（`format: "bento3d"`）。
- 分享链接把完整配置编码进 `#cfg=<base64url>`，纯静态部署也能还原模型；打开链接即自动载入。
- 提供零依赖本地 MCP 服务 `mcp/server.mjs`，大模型可通过 `bento3d_create_organizer` 生成配置与分享链接，再在网页中继续编辑。
- 项目内置 `bento3d-organizer` Skill，说明配置格式、参数范围与迭代流程。

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite |
| 3D 渲染 | Three.js + OrbitControls |
| 几何内核 | manifold-3d（WASM 布尔运算） |
| 状态管理 | zustand |
| 3MF 打包 | fflate |

## 本地运行

环境要求：Node.js 20+（推荐 22）。

```bash
# 安装依赖
npm ci

# 启动开发服务器（http://localhost:5173）
npm run dev

# 类型检查并构建生产版本
npm run build

# 本地预览构建产物
npm run preview
```

大模型 / MCP 模式（可选，零额外依赖）：

```bash
# 启动本地 MCP 服务（stdio）
node mcp/server.mjs
```

MCP 客户端配置、工具说明见 [`mcp/README.md`](mcp/README.md) 与 [`.trae/skills/bento3d-organizer/SKILL.md`](.trae/skills/bento3d-organizer/SKILL.md)。

> 生产构建使用 `/Bento3D-Studio/` 作为资源基础路径，以适配 GitHub Pages 项目站点；本地开发仍为根路径 `/`。

## 部署

推送到 `main` 分支后，GitHub Actions 会自动执行 `npm ci`、`npm run build` 并发布 `dist` 到 GitHub Pages。

首次部署前，请在仓库 `Settings → Pages → Build and deployment` 中将 Source 选择为 **GitHub Actions**。

部署地址：<https://king-jingxiang.github.io/Bento3D-Studio/>

## 项目结构

```text
src/
├─ components/   # 参数面板、3D 视口、网格编辑器、数字输入框
├─ lib/          # 几何构建、外形轮廓、多层收纳盒、配置格式、字体、3MF 导出、manifold 封装
├─ assets/       # helvetiker 字体数据
├─ App.tsx       # 主界面、几何构建调度、配置导入导出与链接分享
├─ store.ts      # zustand 状态、参数约束、网格与分层操作
└─ types.ts      # 参数类型、默认值与取值范围
mcp/
├─ server.mjs    # 零依赖 stdio MCP 服务
├─ config.mjs    # 与网页一致的配置校验 / 分享链接逻辑
└─ README.md     # MCP 接入说明
.trae/skills/bento3d-organizer/SKILL.md  # 大模型生成收纳盒的项目 Skill
```

## 使用提示

- 所有尺寸单位均为 mm。
- 隔板高度默认低于外壁，便于取放物品。
- 在“预览”视图中：拖拽旋转、滚轮缩放、右键平移。
- 导出前会重新构建一次几何，确保 3MF 与当前参数一致。
- 3MF 已包含缩放与打印排版，切片软件中通常无需再手动摆放。

## 致谢

界面与交互参考 Bento3D 参数化托盘设计工具，本项目为独立的浏览器端复刻实现。
