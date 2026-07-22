import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(rootDir, "dist");

beforeAll(() => {
  // Force production mode explicitly: vitest sets NODE_ENV=test on its own
  // process, and execSync would otherwise inherit that into this nested
  // build, producing a bloated dev-mode bundle (jsx-dev-runtime) in dist/.
  execSync("npm run build", { cwd: rootDir, stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
}, 60000);

function readManifest(): Record<string, any> {
  return JSON.parse(readFileSync(join(distDir, "manifest.json"), "utf8"));
}

function scriptSources(html: string): string[] {
  return Array.from(html.matchAll(/src="([^"]+)"/g)).map((match) => match[1]);
}

describe("build output", () => {
  it("emits the required extension entry points", () => {
    for (const file of ["manifest.json", "devtools.html", "panel.html", "popup.html", "background.js"]) {
      expect(existsSync(join(distDir, file)), `missing dist/${file}`).toBe(true);
    }
  });

  it("emits a valid manifest with the icons it declares present on disk", () => {
    const manifest = readManifest();

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("API Cartographer");
    expect(typeof manifest.version).toBe("string");

    const iconPaths = [
      ...Object.values(manifest.icons ?? {}),
      ...Object.values(manifest.action?.default_icon ?? {})
    ] as string[];

    expect(iconPaths.length).toBeGreaterThan(0);

    for (const iconPath of iconPaths) {
      expect(existsSync(join(distDir, iconPath)), `missing icon file ${iconPath}`).toBe(true);
    }
  });

  it("references a background service worker file that exists on disk", () => {
    const manifest = readManifest();
    expect(existsSync(join(distDir, manifest.background.service_worker))).toBe(true);
  });

  it("keeps devtools/panel/popup HTML pointing at built asset files", () => {
    for (const htmlFile of ["devtools.html", "panel.html", "popup.html"]) {
      const html = readFileSync(join(distDir, htmlFile), "utf8");
      const sources = scriptSources(html);
      expect(sources.length, `${htmlFile} references no scripts`).toBeGreaterThan(0);

      for (const src of sources) {
        if (/^https?:\/\//.test(src)) {
          continue;
        }

        const assetPath = join(distDir, src.replace(/^\//, ""));
        expect(existsSync(assetPath), `${htmlFile} references missing asset ${src}`).toBe(true);
      }
    }
  });
});
