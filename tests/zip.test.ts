import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildZip, crc32 } from "../scripts/zip.mjs";

interface ParsedEntry {
  name: string;
  crc: number;
  content: Buffer;
}

function parseZip(buffer: Buffer): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const signature = buffer.readUInt32LE(offset);

    if (signature !== 0x04034b50) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const crc = buffer.readUInt32LE(offset + 14);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = compressionMethod === 8 ? inflateRawSync(compressed) : compressed;

    expect(content.length).toBe(uncompressedSize);
    entries.push({ name, crc, content });

    offset = dataStart + compressedSize;
  }

  return entries;
}

describe("zip writer", () => {
  it("round-trips file contents through deflate", () => {
    const entries = [
      { name: "manifest.json", content: Buffer.from("{\"name\":\"API Cartographer\"}") },
      { name: "assets/panel.js", content: Buffer.from("console.log('panel loaded');".repeat(20)) }
    ];

    const zip = buildZip(entries);
    const parsed = parseZip(zip);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("manifest.json");
    expect(parsed[0].content.toString("utf8")).toBe(entries[0].content.toString("utf8"));
    expect(parsed[0].crc).toBe(crc32(entries[0].content));
    expect(parsed[1].content.toString("utf8")).toBe(entries[1].content.toString("utf8"));
  });

  it("ends with a valid end-of-central-directory record", () => {
    const entries = [{ name: "a.txt", content: Buffer.from("a") }];
    const zip = buildZip(entries);
    const eocdSignature = zip.readUInt32LE(zip.length - 22);

    expect(eocdSignature).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(1);
  });

  it("produces an empty archive for no entries", () => {
    const zip = buildZip([]);

    expect(zip.length).toBe(22);
    expect(zip.readUInt32LE(0)).toBe(0x06054b50);
  });
});
