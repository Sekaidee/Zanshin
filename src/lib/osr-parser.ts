// @ts-ignore - lzma-web types
import LZMA from 'lzma-web';

// Configure LZMA to use synchronous mode (no worker)
LZMA.disableWorker = true;

export interface ReplayFrame {
  time: number;
  keys: boolean[];
}

export interface ReplayInfo {
  gameMode: number;
  playerName: string;
  beatmapHash: string;
  score: number;
  maxCombo: number;
  count300: number;
  count100: number;
  count50: number;
  countMiss: number;
  frames: ReplayFrame[];
}

class BinaryReader {
  private view: DataView;
  private bytes: Uint8Array;
  private offset = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
  }

  readByte() { return this.view.getUint8(this.offset++); }

  readShort() {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readInt() {
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readLong() {
    this.offset += 8;
  }

  readULEB128() {
    let result = 0, shift = 0, byte: number;
    do {
      byte = this.readByte();
      result |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    return result;
  }

  readOsuString() {
    const flag = this.readByte();
    if (flag === 0x00) return '';
    // flag should be 0x0b
    const len = this.readULEB128();
    const bytes = this.bytes.slice(this.offset, this.offset + len);
    this.offset += len;
    return new TextDecoder().decode(bytes);
  }

  readBytes(len: number) {
    const b = this.bytes.slice(this.offset, this.offset + len);
    this.offset += len;
    return b;
  }
}

export async function parseOsrFile(buffer: ArrayBuffer): Promise<ReplayInfo> {
  const reader = new BinaryReader(buffer);

  const gameMode = reader.readByte();
  reader.readInt(); // game version
  const beatmapHash = reader.readOsuString();
  const playerName = reader.readOsuString();
  reader.readOsuString(); // replay hash

  const count300 = reader.readShort();
  const count100 = reader.readShort();
  const count50 = reader.readShort();
  reader.readShort(); // geki
  reader.readShort(); // katu
  const countMiss = reader.readShort();

  const score = reader.readInt();
  const maxCombo = reader.readShort();
  reader.readByte(); // perfect
  reader.readInt(); // mods

  reader.readOsuString(); // life bar graph
  reader.readLong(); // timestamp

  const compressedLength = reader.readInt();
  let frames: ReplayFrame[] = [];

  if (compressedLength > 0) {
    const compressedData = reader.readBytes(compressedLength);

    try {
      const lzma = new LZMA();
      const decompressed = await lzma.decompress(compressedData);
      const text = typeof decompressed === 'string'
        ? decompressed
        : new TextDecoder().decode(decompressed as unknown as Uint8Array);
      frames = parseReplayFrames(text);
    } catch (e) {
      console.error('LZMA decompression failed:', e);
    }
  }

  return { gameMode, playerName, beatmapHash, score, maxCombo, count300, count100, count50, countMiss, frames };
}

function parseReplayFrames(data: string): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  const parts = data.split(',').filter(p => p.trim().length > 0);

  let absoluteTime = 0;

  for (const part of parts) {
    const segments = part.split('|');
    if (segments.length < 2) continue;

    const w = parseInt(segments[0]);
    const x = parseInt(segments[1]);

    if (w === -12345) continue; // seed frame

    absoluteTime += w;

    // For mania 4K, x is a bitmask of pressed keys
    const keys = [
      (x & 1) !== 0,
      (x & 2) !== 0,
      (x & 4) !== 0,
      (x & 8) !== 0,
    ];

    frames.push({ time: absoluteTime, keys });
  }

  return frames;
}
