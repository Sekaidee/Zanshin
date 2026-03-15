import { ManiaNote } from './osu-parser';
import { ReplayFrame } from './osr-parser';

const LANE_COLORS = ['#ff6b9d', '#51e5ff', '#51e5ff', '#ff6b9d'];
const LANE_COLORS_DIM = ['#ff6b9d40', '#51e5ff40', '#51e5ff40', '#ff6b9d40'];
const BG_COLOR = '#08080f';
const LANE_BG = ['#12121e', '#0f0f1c', '#0f0f1c', '#12121e'];

export function renderFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  currentTime: number,
  notes: ManiaNote[],
  replayFrames: ReplayFrame[],
  width: number,
  height: number,
  scrollSpeed: number
) {
  const playfieldWidth = Math.min(width * 0.3, 400);
  const playfieldX = (width - playfieldWidth) / 2;
  const laneWidth = playfieldWidth / 4;
  const judgmentY = height * 0.88;
  const noteHeight = Math.max(14, height * 0.018);
  const pixelsPerMs = judgmentY / scrollSpeed;

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  // Subtle background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#0a0a18');
  bgGrad.addColorStop(0.5, '#08080f');
  bgGrad.addColorStop(1, '#0c0c14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Lane backgrounds
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = LANE_BG[i];
    ctx.fillRect(playfieldX + i * laneWidth, 0, laneWidth, height);
  }

  // Lane dividers
  ctx.strokeStyle = '#ffffff12';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(playfieldX + i * laneWidth, 0);
    ctx.lineTo(playfieldX + i * laneWidth, height);
    ctx.stroke();
  }

  // Playfield border
  ctx.strokeStyle = '#ffffff25';
  ctx.lineWidth = 2;
  ctx.strokeRect(playfieldX, 0, playfieldWidth, height);

  // Draw notes
  const visibleMinTime = currentTime - scrollSpeed * 0.15;
  const visibleMaxTime = currentTime + scrollSpeed * 1.1;

  for (const note of notes) {
    const noteEnd = note.endTime || note.time;
    if (noteEnd < visibleMinTime) continue;
    if (note.time > visibleMaxTime) break; // notes are sorted by time

    const col = note.column;
    const x = playfieldX + col * laneWidth + 3;
    const w = laneWidth - 6;
    const color = LANE_COLORS[col];
    const dimColor = LANE_COLORS_DIM[col];

    if (note.isHold && note.endTime) {
      const yHead = judgmentY - (note.time - currentTime) * pixelsPerMs;
      const yTail = judgmentY - (note.endTime - currentTime) * pixelsPerMs;
      const yTop = Math.min(yHead, yTail);
      const yBot = Math.max(yHead, yTail);

      // Hold body
      ctx.fillStyle = dimColor;
      ctx.fillRect(x + 2, yTop, w - 4, yBot - yTop);

      // Hold border
      ctx.strokeStyle = color + '60';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2, yTop, w - 4, yBot - yTop);

      // Head & tail
      ctx.fillStyle = color;
      ctx.fillRect(x, yHead - noteHeight / 2, w, noteHeight);
      ctx.fillRect(x, yTail - noteHeight / 2, w, noteHeight);
    } else {
      const y = judgmentY - (note.time - currentTime) * pixelsPerMs;
      ctx.fillStyle = color;

      // Note with rounded corners
      const r = 3;
      ctx.beginPath();
      ctx.moveTo(x + r, y - noteHeight / 2);
      ctx.lineTo(x + w - r, y - noteHeight / 2);
      ctx.arcTo(x + w, y - noteHeight / 2, x + w, y - noteHeight / 2 + r, r);
      ctx.lineTo(x + w, y + noteHeight / 2 - r);
      ctx.arcTo(x + w, y + noteHeight / 2, x + w - r, y + noteHeight / 2, r);
      ctx.lineTo(x + r, y + noteHeight / 2);
      ctx.arcTo(x, y + noteHeight / 2, x, y + noteHeight / 2 - r, r);
      ctx.lineTo(x, y - noteHeight / 2 + r);
      ctx.arcTo(x, y - noteHeight / 2, x + r, y - noteHeight / 2, r);
      ctx.closePath();
      ctx.fill();

      // Subtle glow
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();
    }
  }

  // Judgment line
  ctx.save();
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#ffffffcc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playfieldX, judgmentY);
  ctx.lineTo(playfieldX + playfieldWidth, judgmentY);
  ctx.stroke();
  ctx.restore();

  // Key press indicators from replay
  const currentFrame = getFrameAtTime(replayFrames, currentTime);
  if (currentFrame) {
    for (let i = 0; i < 4; i++) {
      if (currentFrame.keys[i]) {
        const lx = playfieldX + i * laneWidth;
        const color = LANE_COLORS[i];

        // Column flash
        const grad = ctx.createLinearGradient(lx, judgmentY - 80, lx, judgmentY + 15);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.6, color + '30');
        grad.addColorStop(1, color + 'aa');
        ctx.fillStyle = grad;
        ctx.fillRect(lx, judgmentY - 80, laneWidth, 95);

        // Receptor highlight
        ctx.fillStyle = color;
        ctx.fillRect(lx + 3, judgmentY - 4, laneWidth - 6, 8);
      }
    }
  }

  // Receptors (always visible, dimmer when not pressed)
  for (let i = 0; i < 4; i++) {
    const lx = playfieldX + i * laneWidth;
    const pressed = currentFrame?.keys[i] ?? false;
    ctx.fillStyle = pressed ? LANE_COLORS[i] + 'ff' : '#ffffff20';
    ctx.fillRect(lx + 3, judgmentY + 5, laneWidth - 6, 6);
  }

  // Side info: time display
  ctx.fillStyle = '#ffffff60';
  ctx.font = `${Math.max(12, height * 0.014)}px monospace`;
  ctx.textAlign = 'left';
  const mins = Math.floor(currentTime / 60000);
  const secs = Math.floor((currentTime % 60000) / 1000);
  ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, playfieldX - 80, judgmentY);
}

function getFrameAtTime(frames: ReplayFrame[], time: number): ReplayFrame | null {
  if (frames.length === 0) return null;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo].time <= time ? frames[lo] : null;
}

export function getMapDuration(notes: ManiaNote[]): number {
  let maxTime = 0;
  for (const note of notes) {
    const t = note.endTime || note.time;
    if (t > maxTime) maxTime = t;
  }
  return maxTime + 2000;
}
