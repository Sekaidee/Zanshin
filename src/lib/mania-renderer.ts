import { ManiaNote } from './osu-parser';
import { ReplayFrame } from './osr-parser';

const LANE_COLORS = ['#ff6b9d', '#51e5ff', '#51e5ff', '#ff6b9d'];
const LANE_COLORS_DIM = ['#ff6b9d40', '#51e5ff40', '#51e5ff40', '#ff6b9d40'];
const BG_COLOR = '#08080f';
const LANE_BG = ['rgba(18, 18, 30, 0.7)', 'rgba(15, 15, 28, 0.7)', 'rgba(15, 15, 28, 0.7)', 'rgba(18, 18, 30, 0.7)'];

export function renderFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  currentTime: number,
  notes: ManiaNote[],
  replayFrames: ReplayFrame[],
  width: number,
  height: number,
  scrollSpeed: number,
  backgroundImage?: HTMLImageElement | ImageBitmap,
  backgroundDim: number = 0,
  noteColors?: { key1: string; key2: string; key3: string; key4: string }
) {
  const laneColors = noteColors ? [noteColors.key1, noteColors.key2, noteColors.key3, noteColors.key4] : LANE_COLORS;
  const laneColorsDim = noteColors ? [
    noteColors.key1 + '40',
    noteColors.key2 + '40', 
    noteColors.key3 + '40',
    noteColors.key4 + '40'
  ] : LANE_COLORS_DIM;

  // Background
  if (backgroundImage) {
    // Draw background image with cover scaling
    const imgAspect = backgroundImage.width / backgroundImage.height;
    const canvasAspect = width / height;
    
    let drawWidth, drawHeight, drawX, drawY;
    
    if (imgAspect > canvasAspect) {
      // Image is wider than canvas - scale to cover height, center horizontally
      drawHeight = height;
      drawWidth = height * imgAspect;
      drawX = (width - drawWidth) / 2;
      drawY = 0;
    } else {
      // Image is taller than canvas - scale to cover width, center vertically
      drawWidth = width;
      drawHeight = width / imgAspect;
      drawX = 0;
      drawY = (height - drawHeight) / 2;
    }
    
    ctx.drawImage(backgroundImage, drawX, drawY, drawWidth, drawHeight);
    
    // Apply dim overlay if specified
    if (backgroundDim > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${backgroundDim / 100})`;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    // Default background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    // Subtle background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#0a0a18');
    bgGrad.addColorStop(0.5, '#08080f');
    bgGrad.addColorStop(1, '#0c0c14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
  }

  const playfieldWidth = Math.min(width * 0.3, 400);
  const playfieldX = (width - playfieldWidth) / 2;
  const laneWidth = playfieldWidth / 4;
  const judgmentY = height * 0.88;
  const noteHeight = Math.max(14, height * 0.018);
  const pixelsPerMs = judgmentY / scrollSpeed;

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

    // Don't render notes that have passed the judgment line (simulating they were hit)
    // But hold notes should remain visible until their end time
    if (!note.isHold && note.time < currentTime) continue;
    // Hold notes disappear after their end time
    if (note.isHold && note.endTime && note.endTime < currentTime) continue;

    const col = note.column;
    const x = playfieldX + col * laneWidth + 3;
    const w = laneWidth - 6;
    const color = laneColors[col];
    const dimColor = laneColorsDim[col];

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
        const color = laneColors[i];

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
    ctx.fillStyle = pressed ? laneColors[i] + 'ff' : '#ffffff20';
    ctx.fillRect(lx + 3, judgmentY + 5, laneWidth - 6, 6);
  }

  // Side info: time display
  ctx.fillStyle = '#ffffff60';
  ctx.font = `${Math.max(12, height * 0.014)}px monospace`;
  ctx.textAlign = 'left';
  const mins = Math.floor(currentTime / 60000);
  const secs = Math.floor((currentTime % 60000) / 1000);
  ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, playfieldX - 80, judgmentY);

  // Combo counter based on actual replay hits
  let combo = 0;
  if (replayFrames.length > 0) {
    // Analyze replay data to count actual hits
    let consecutiveHits = 0;
    
    for (const note of notes) {
      if (note.time > currentTime) break;
      
      // Check if this note was hit by looking for key presses near the note time
      const hitWindow = 80; // ms hit window (similar to osu!mania)
      let wasHit = false;
      
      // Look for key presses in the correct lane within the hit window
      for (const frame of replayFrames) {
        if (Math.abs(frame.time - note.time) <= hitWindow) {
          if (frame.keys[note.column]) {
            wasHit = true;
            break;
          }
        }
        // Since frames are sorted by time, we can break early
        if (frame.time > note.time + hitWindow) break;
      }
      
      if (wasHit) {
        consecutiveHits++;
        combo = consecutiveHits;
      } else {
        // Miss - reset combo
        consecutiveHits = 0;
        combo = 0;
      }
    }
  } else {
    // Fallback for preview without replay
    for (const note of notes) {
      if (note.time < currentTime) {
        combo++;
      } else {
        break;
      }
    }
  }

  if (combo > 0) {
    ctx.save();
    
    // Calculate animation based on current time (simple pulsing effect)
    const pulse = Math.sin(currentTime * 0.01) * 0.1 + 0.9; // Subtle pulsing
    const scale = combo > 1 ? 1.0 + (pulse * 0.1) : 1.0; // Scale up for higher combos
    
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(24, height * 0.028) * scale}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    
    // Add glow effect that intensifies with combo
    ctx.shadowColor = combo > 10 ? '#ff6b9d' : '#ffffff';
    ctx.shadowBlur = Math.min(20, combo * 2);
    
    const comboText = `${combo}x`;
    const comboX = 20; // Left side of the video
    const comboY = height - 40;
    
    ctx.fillText(comboText, comboX, comboY);
    ctx.restore();
  }
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
