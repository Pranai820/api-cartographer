#!/usr/bin/env node
// Builds the extension and packages dist/ into a Chrome Web Store-ready zip.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildZip } from "./zip.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(rootDir, "dist");
const releaseDir = join(rootDir, "release");

function listFiles(dir) {
  const files = [];

  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    const info = statSync(fullPath);

    if (info.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (info.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectEntries(sourceDir) {
  return listFiles(sourceDir).map((filePath) => ({
    name: relative(sourceDir, filePath).split(sep).join("/"),
    content: readFileSync(filePath)
  }));
}

function main() {
  console.log("Building extension...");
  execSync("npm run build", { cwd: rootDir, stdio: "inherit" });

  const manifest = JSON.parse(readFileSync(join(rootDir, "public", "manifest.json"), "utf8"));
  const zipBuffer = buildZip(collectEntries(distDir));

  mkdirSync(releaseDir, { recursive: true });
  const outputPath = join(releaseDir, `api-cartographer-v${manifest.version}.zip`);
  writeFileSync(outputPath, zipBuffer);

  console.log(`Packaged ${manifest.name} v${manifest.version} -> ${relative(rootDir, outputPath)}`);
}

main();
