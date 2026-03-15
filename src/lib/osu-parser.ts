export interface ManiaNote {
  column: number;
  time: number;
  endTime?: number;
  isHold: boolean;
}

export interface BeatmapInfo {
  title: string;
  artist: string;
  version: string;
  creator: string;
  keyCount: number;
  mode: number;
  audioFilename: string;
  notes: ManiaNote[];
}

export function parseOsuFile(content: string): BeatmapInfo {
  const lines = content.split(/\r?\n/).map(l => l.trim());

  let section = '';
  let title = '', artist = '', version = '', creator = '', audioFilename = '';
  let keyCount = 4;
  let mode = 0;
  const notes: ManiaNote[] = [];

  for (const line of lines) {
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1);
      continue;
    }

    if (!line || line.startsWith('//')) continue;

    if (section === 'General') {
      if (line.startsWith('Mode:')) mode = parseInt(line.split(':')[1].trim());
      if (line.startsWith('AudioFilename:')) audioFilename = line.split(':')[1].trim();
    }

    if (section === 'Metadata') {
      if (line.startsWith('Title:')) title = line.slice(6).trim();
      if (line.startsWith('Artist:')) artist = line.slice(7).trim();
      if (line.startsWith('Version:')) version = line.slice(8).trim();
      if (line.startsWith('Creator:')) creator = line.slice(8).trim();
    }

    if (section === 'Difficulty') {
      if (line.startsWith('CircleSize:')) keyCount = parseFloat(line.split(':')[1].trim());
    }

    if (section === 'HitObjects' && line.length > 0) {
      const parts = line.split(',');
      if (parts.length < 4) continue;

      const x = parseInt(parts[0]);
      const time = parseInt(parts[2]);
      const type = parseInt(parts[3]);
      const column = Math.floor(x * keyCount / 512);

      const isHold = (type & 128) !== 0;
      let endTime: number | undefined;

      if (isHold && parts.length >= 6) {
        const extras = parts[5].split(':');
        endTime = parseInt(extras[0]);
      }

      notes.push({ column: Math.min(column, keyCount - 1), time, endTime, isHold });
    }
  }

  notes.sort((a, b) => a.time - b.time);

  return { title, artist, version, creator, keyCount, mode, audioFilename, notes };
}
