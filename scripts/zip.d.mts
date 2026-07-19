export interface ZipEntry {
  name: string;
  content: Buffer;
}

export function crc32(buffer: Buffer): number;
export function dosDateTime(date: Date): { time: number; day: number };
export function buildZip(entries: ZipEntry[], now?: Date): Buffer;
