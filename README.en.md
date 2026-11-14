# Bento3D Studio

[简体中文](README.md) | English

[![Deploy to GitHub Pages](https://github.com/king-jingxiang/Bento3D-Studio/actions/workflows/deploy.yml/badge.svg)](https://github.com/king-jingxiang/Bento3D-Studio/actions/workflows/deploy.yml)

A parametric tray generator for 3D printing. Tune dimensions, split compartments, add wall perforations and embossed labels in the browser, preview the model in real time, and export a print-ready 3MF file in one click.

- Live demo: <https://king-jingxiang.github.io/Bento3D-Studio/>
- Repository: <https://github.com/king-jingxiang/Bento3D-Studio>

## Features

### Parametric dimensions

- Adjust width, depth and height directly from the dimension handles on the canvas, or type exact values in the side panel (all values in mm).
- Configurable wall thickness, outer fillet radius, partition height and a stacking lip on top.
- Every parameter has a safe range defined in `src/types.ts`; inputs are clamped automatically.

### Grid / compartment editor

- Three built-in views: `Size`, `Grid` and `Preview`.
- Drag dividers in the Grid view to resize rows and columns; double-click a divider to remove it.
- Quick presets for 1×1, 2×2 and 3×3, plus free-form row/column insertion.
- Click a cell to select it, use `Shift` / `Ctrl` / `Cmd` for multi-select and merge; merged cells can be split again.

### Wall patterns and details

- Wall perforations: hexagonal or circular holes with adjustable hole size and spacing density (dense / normal / relaxed).
- Embossed label: 0.7 mm raised text on the front wall, up to 16 characters.
- Finger pull: a lifting notch on the front wall with adjustable width and height.

### Tray + storage box set

- Switch to `Partition & Box` mode to generate a storage box sized for a chosen number of stackable trays.
- Adjustable single-side clearance between trays and box walls, a snap-fit lid, and an explode slider to inspect the assembly.
- The 3MF export contains the tray, box and lid as three objects (print the tray once and duplicate it as needed).

### Real-time geometry and export

- Boolean operations run locally in the browser via `manifold-3d` (WASM); geometry rebuilds automatically as parameters change.
- Everything is computed client-side — models are never uploaded to a server.
- One-click 3MF export: parts are laid out automatically on a 220 mm wide print bed with 8 mm spacing, ready for Bambu Studio, OrcaSlicer or any other slicer.
- File names include the overall size, e.g. `bento3d-tray-W100xD100xH20.3mf`.

## Tech stack

| Area | Choice |
| --- | --- |
| UI | React 19 + TypeScript |
| Build tool | Vite |
| 3D rendering | Three.js + OrbitControls |
| Geometry kernel | manifold-3d (WASM boolean operations) |
| State management | zustand |
| 3MF packaging | fflate |

## Getting started

Requires Node.js 20+ (22 recommended).

```bash
# Install dependencies
npm ci

# Start the dev server (http://localhost:5173)
npm run dev

# Type-check and build for production
npm run build

# Preview the production build locally
npm run preview
```

> Production builds use `/Bento3D-Studio/` as the asset base path to match the GitHub Pages project site, while the local dev server stays at `/`.

## Deployment

Pushing to `main` triggers GitHub Actions, which runs `npm ci`, `npm run build` and publishes `dist` to GitHub Pages.

For the first deployment, set `Settings → Pages → Build and deployment → Source` to **GitHub Actions**.

Deployed site: <https://king-jingxiang.github.io/Bento3D-Studio/>

## Project structure

```text
src/
├─ components/   # Parameter panel, 3D viewport, grid editor, number input
├─ lib/          # Geometry builders, grid math, font, 3MF export, manifold wrapper
├─ assets/       # helvetiker font data
├─ App.tsx       # Main layout, rebuild scheduling and export flow
├─ store.ts      # zustand state, parameter clamping and grid actions
└─ types.ts      # Parameter types, defaults and limits
```

## Usage notes

- All dimensions are in millimetres.
- Partitions are slightly lower than the outer wall so items are easy to grab.
- In the Preview view: drag to rotate, scroll to zoom, right-drag to pan.
- Geometry is rebuilt once more on export, so the 3MF always matches the current parameters.
- Parts are already positioned for printing, so manual arrangement in the slicer is usually unnecessary.

## Acknowledgements

The interface and interactions are inspired by the Bento3D parametric tray design tool; this project is an independent browser-based recreation.
