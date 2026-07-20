#!/usr/bin/env node
// Renders the extension's network-graph icon at each required size, without
// any image/design dependency, and writes PNGs into public/icons/.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(rootDir, "public", "icons");

const SIZES = [16, 32, 48, 128];
const BACKGROUND = [45, 139, 118, 255]; // #2d8b76
const NODE_COLOR = [255, 255, 255, 255];
const LINE_COLOR = [255, 255, 255, 210];

const NODES = [
  { x: 0.3, y: 0.28 },
  { x: 0.74, y: 0.42 },
  { x: 0.42, y: 0.76 }
];
const EDGES = [[0, 1], [1, 2], [2, 0]];

function insideRoundedRect(x, y, size, radius) {
  const cx = x < radius ? radius : x > size - radius ? size - radius : x;
  const cy = y < radius ? radius : y > size - radius ? size - radius : y;

  if ((x === cx || y === cy) && x >= 0 && x < size && y >= 0 && y < size) {
    return true;
  }

  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSquared));
  const closestX = ax + t * abx;
  const closestY = ay + t * aby;
  return Math.hypot(px - closestX, py - closestY);
}

function blend(base, color, alpha) {
  const a = alpha / 255;
  return [
    Math.round(color[0] * a + base[0] * (1 - a)),
    Math.round(color[1] * a + base[1] * (1 - a)),
    Math.round(color[2] * a + base[2] * (1 - a)),
    255
  ];
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cornerRadius = size * 0.18;
  const nodeRadius = Math.max(1, size * 0.1);
  const lineThickness = Math.max(0.75, size * 0.035);
  const nodes = NODES.map((node) => ({ x: node.x * size, y: node.y * size }));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;

      if (!insideRoundedRect(x + 0.5, y + 0.5, size, cornerRadius)) {
        rgba[offset] = 0;
        rgba[offset + 1] = 0;
        rgba[offset + 2] = 0;
        rgba[offset + 3] = 0;
        continue;
      }

      let pixel = BACKGROUND;

      for (const [fromIndex, toIndex] of EDGES) {
        const from = nodes[fromIndex];
        const to = nodes[toIndex];
        const distance = distanceToSegment(x + 0.5, y + 0.5, from.x, from.y, to.x, to.y);

        if (distance <= lineThickness) {
          pixel = blend(pixel, LINE_COLOR, LINE_COLOR[3]);
        }
      }

      for (const node of nodes) {
        const distance = Math.hypot(x + 0.5 - node.x, y + 0.5 - node.y);

        if (distance <= nodeRadius) {
          pixel = NODE_COLOR;
        }
      }

      rgba[offset] = pixel[0];
      rgba[offset + 1] = pixel[1];
      rgba[offset + 2] = pixel[2];
      rgba[offset + 3] = pixel[3];
    }
  }

  return rgba;
}

function main() {
  mkdirSync(outDir, { recursive: true });

  for (const size of SIZES) {
    const rgba = renderIcon(size);
    const png = encodePng(size, size, rgba);
    const outputPath = join(outDir, `icon-${size}.png`);
    writeFileSync(outputPath, png);
    console.log(`Wrote ${outputPath}`);
  }
}

main();
