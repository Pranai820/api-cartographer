import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePng } from "../scripts/png.mjs";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readChunks(png: Buffer): Array<{ type: string; data: Buffer }> {
  const chunks: Array<{ type: string; data: Buffer }> = [];
  let offset = PNG_SIGNATURE.length;

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 8 + length + 4; // length + type + data + crc
  }

  return chunks;
}

describe("PNG encoder", () => {
  it("writes the PNG signature and IHDR/IDAT/IEND chunks", () => {
    const rgba = Buffer.alloc(2 * 2 * 4, 0);
    const png = encodePng(2, 2, rgba);

    expect(Array.from(png.subarray(0, 8))).toEqual(PNG_SIGNATURE);

    const chunks = readChunks(png);
    expect(chunks.map((chunk) => chunk.type)).toEqual(["IHDR", "IDAT", "IEND"]);

    const ihdr = chunks[0].data;
    expect(ihdr.readUInt32BE(0)).toBe(2);
    expect(ihdr.readUInt32BE(4)).toBe(2);
    expect(ihdr.readUInt8(8)).toBe(8); // bit depth
    expect(ihdr.readUInt8(9)).toBe(6); // RGBA color type
  });

  it("round-trips pixel data through zlib deflate", () => {
    const width = 3;
    const height = 2;
    const rgba = Buffer.from([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120
    ]);

    const png = encodePng(width, height, rgba);
    const idat = readChunks(png).find((chunk) => chunk.type === "IDAT");
    const raw = inflateSync(idat!.data);

    const stride = width * 4;
    const reconstructed = Buffer.alloc(width * height * 4);

    for (let y = 0; y < height; y += 1) {
      const rowStart = y * (stride + 1);
      expect(raw[rowStart]).toBe(0); // filter type: none
      raw.copy(reconstructed, y * stride, rowStart + 1, rowStart + 1 + stride);
    }

    expect(reconstructed).toEqual(rgba);
  });

  it("rejects a buffer with the wrong size", () => {
    expect(() => encodePng(2, 2, Buffer.alloc(4))).toThrow();
  });
});
