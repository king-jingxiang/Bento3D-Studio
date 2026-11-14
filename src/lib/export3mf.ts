import { strToU8, zipSync } from 'fflate';
import type { PartInfo } from '../types';
import { round } from '../types';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

const RELATIONSHIPS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function number(value: number): string {
  return round(value, 4).toString();
}

export interface ExportLayout {
  x: number;
  y: number;
}

/** Lay parts out on the print bed using compact rows (target width 220 mm). */
export function layoutParts(parts: PartInfo[], maxWidth = 220): ExportLayout[] {
  const gap = 8;
  let cursorX = 0;
  let cursorY = 0;
  let rowDepth = 0;
  return parts.map((part) => {
    if (cursorX > 0 && cursorX + part.width > maxWidth) {
      cursorY += rowDepth + gap;
      cursorX = 0;
      rowDepth = 0;
    }
    const x = cursorX + part.width / 2;
    const y = cursorY + part.depth / 2;
    cursorX += part.width + gap;
    rowDepth = Math.max(rowDepth, part.depth);
    return { x, y };
  });
}

export function build3mf(parts: PartInfo[], title = 'Bento3D parametric tray'): Uint8Array {
  const materials: string[] = [];
  const objects: string[] = [];
  const items: string[] = [];
  const layouts = layoutParts(parts);

  parts.forEach((part, index) => {
    const objectId = index + 2;
    const vertexCount = part.mesh.vertProperties.length / 3;
    const vertices: string[] = new Array(vertexCount);
    for (let i = 0; i < vertexCount; i += 1) {
      const x = part.mesh.vertProperties[i * 3];
      const y = part.mesh.vertProperties[i * 3 + 1];
      const z = part.mesh.vertProperties[i * 3 + 2];
      vertices[i] = `<vertex x="${number(x)}" y="${number(y)}" z="${number(z)}"/>`;
    }
    const triangleCount = part.mesh.triVerts.length / 3;
    const triangles: string[] = new Array(triangleCount);
    for (let i = 0; i < triangleCount; i += 1) {
      triangles[i] =
        `<triangle v1="${part.mesh.triVerts[i * 3]}" v2="${part.mesh.triVerts[i * 3 + 1]}" v3="${part.mesh.triVerts[i * 3 + 2]}"/>`;
    }
    const color = part.color.replace('#', '').toUpperCase();
    materials.push(`<base name="${escapeXml(part.name)}" displaycolor="#${color}FF"/>`);
    const name = `${part.name} ${round(part.width, 1)}x${round(part.depth, 1)}x${round(part.height, 1)}mm`;
    objects.push(
      `<object id="${objectId}" type="model" name="${escapeXml(name)}" pid="1" pindex="${index}">` +
        `<mesh><vertices>${vertices.join('')}</vertices>` +
        `<triangles>${triangles.join('')}</triangles></mesh></object>`,
    );
    const layout = layouts[index];
    items.push(
      `<item objectid="${objectId}" transform="1 0 0 0 1 0 0 0 1 ${number(layout.x)} ${number(layout.y)} 0"/>`,
    );
  });

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${escapeXml(title)}</metadata>
  <metadata name="Application">Bento3D Studio</metadata>
  <resources>
    <basematerials id="1">${materials.join('')}</basematerials>
    ${objects.join('\n    ')}
  </resources>
  <build>
    ${items.join('\n    ')}
  </build>
</model>`;

  return zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(RELATIONSHIPS),
      '3D/3dmodel.model': strToU8(model),
    },
    { level: 6 },
  );
}

export function download3mf(parts: PartInfo[], filename: string, title?: string) {
  const data = build3mf(parts, title);
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'model/3mf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.3mf') ? filename : `${filename}.3mf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
