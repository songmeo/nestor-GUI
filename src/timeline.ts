// ---------------------------------------------------------------------------
// Timeline renderer — CAN messages over time (adapted from Gerasim)
// ---------------------------------------------------------------------------

import type { TimelineMessage } from './types';
import { getCanIdColor } from './types';

const GUTTER_W = 60;
const ROW_H = 16;
const AXIS_H = 20;
const MARKER_SIZE = 4;

export class Timeline {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tooltip: HTMLElement;

  private messages: TimelineMessage[] = [];
  private viewStartUs = 0;
  private viewEndUs = 10_000_000; // 10s default
  private canIds: number[] = [];
  private canIdRowIndex = new Map<number, number>();
  private selectedMessage: TimelineMessage | null = null;
  private hoveredMessage: TimelineMessage | null = null;

  // Navigation
  onMessageSelect: ((msg: TimelineMessage | null) => void) | null = null;
  private userHasScrolled = false;

  private get logicalW(): number {
    return this.canvas.width / (window.devicePixelRatio || 1);
  }
  private get logicalH(): number {
    return this.canvas.height / (window.devicePixelRatio || 1);
  }

  constructor(canvas: HTMLCanvasElement, tooltip: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.tooltip = tooltip;
    this.setupInteraction();
  }

  setMessages(messages: TimelineMessage[]): void {
    this.messages = messages;

    // Extract unique CAN IDs and sort
    const idSet = new Set<number>();
    for (const m of messages) {
      idSet.add(m.canId);
    }
    this.canIds = Array.from(idSet).sort((a, b) => a - b);
    this.rebuildCanIdIndex();

    // Auto-fit time range
    if (messages.length > 0) {
      const minTime = Math.min(...messages.map(m => m.timeUs));
      const maxTime = Math.max(...messages.map(m => m.timeUs));
      const range = maxTime - minTime || 1_000_000;
      const padding = range * 0.05;
      this.viewStartUs = minTime - padding;
      this.viewEndUs = maxTime + padding;
    }
  }

  addMessage(msg: TimelineMessage): void {
    this.messages.push(msg);

    // Add CAN ID if new
    if (!this.canIdRowIndex.has(msg.canId)) {
      this.canIds.push(msg.canId);
      this.canIds.sort((a, b) => a - b);
      this.rebuildCanIdIndex();
    }

    // Auto-scroll to follow new messages
    if (!this.userHasScrolled && msg.timeUs > this.viewEndUs - (this.viewEndUs - this.viewStartUs) * 0.1) {
      const range = this.viewEndUs - this.viewStartUs;
      this.viewEndUs = msg.timeUs + range * 0.2;
      this.viewStartUs = this.viewEndUs - range;
    }
  }

  clear(): void {
    this.messages = [];
    this.canIds = [];
    this.canIdRowIndex.clear();
    this.selectedMessage = null;
    this.hoveredMessage = null;
    this.viewStartUs = 0;
    this.viewEndUs = 10_000_000;
    this.userHasScrolled = false;
  }

  private rebuildCanIdIndex(): void {
    this.canIdRowIndex.clear();
    for (let i = 0; i < this.canIds.length; i++) {
      this.canIdRowIndex.set(this.canIds[i], i);
    }
  }

  resize(): void {
    const container = this.canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight - 5; // Account for resize handle
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(): void {
    const ctx = this.ctx;
    const W = this.logicalW;
    const H = this.logicalH;
    if (W === 0 || H === 0) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, H);

    const contentH = H - AXIS_H;
    const nRows = this.canIds.length;

    // CAN ID labels in left gutter
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < nRows; i++) {
      const y = i * ROW_H + ROW_H / 2;
      if (y > contentH) break;
      const canId = this.canIds[i];
      ctx.fillStyle = getCanIdColor(canId);
      const idStr = '0x' + canId.toString(16).toUpperCase().padStart(3, '0');
      ctx.fillText(idStr, GUTTER_W - 4, y);
    }

    // Row grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= nRows; i++) {
      const y = i * ROW_H;
      if (y > contentH) break;
      ctx.beginPath();
      ctx.moveTo(GUTTER_W, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Clip plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(GUTTER_W, 0, W - GUTTER_W, contentH);
    ctx.clip();

    // Draw message markers
    for (const msg of this.messages) {
      const x = this.timeToX(msg.timeUs);
      if (x < GUTTER_W - 10 || x > W + 10) continue;

      const rowIdx = this.canIdRowIndex.get(msg.canId) ?? -1;
      if (rowIdx < 0) continue;

      const y = rowIdx * ROW_H + ROW_H / 2;
      if (y > contentH) continue;

      const isSelected = this.selectedMessage === msg;
      const isHovered = this.hoveredMessage === msg;
      const color = getCanIdColor(msg.canId);

      ctx.fillStyle = color;
      ctx.globalAlpha = isSelected || isHovered ? 1.0 : 0.7;

      ctx.beginPath();
      if (isSelected || isHovered) {
        ctx.arc(x, y, MARKER_SIZE + 1, 0, Math.PI * 2);
      } else {
        ctx.arc(x, y, MARKER_SIZE, 0, Math.PI * 2);
      }
      ctx.fill();

      // Draw selection ring
      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, MARKER_SIZE + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1.0;

    ctx.restore();

    // Time axis
    this.drawTimeAxis(ctx, W, H, contentH);

    // Empty state
    if (this.messages.length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No CAN messages', W / 2, contentH / 2);
    }
  }

  private timeToX(timeUs: number): number {
    const range = this.viewEndUs - this.viewStartUs;
    if (range <= 0) return GUTTER_W;
    const frac = (timeUs - this.viewStartUs) / range;
    return GUTTER_W + frac * (this.logicalW - GUTTER_W);
  }

  private xToTime(x: number): number {
    const plotW = this.logicalW - GUTTER_W;
    if (plotW <= 0) return this.viewStartUs;
    const frac = (x - GUTTER_W) / plotW;
    return this.viewStartUs + frac * (this.viewEndUs - this.viewStartUs);
  }

  private drawTimeAxis(ctx: CanvasRenderingContext2D, W: number, H: number, contentH: number): void {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, contentH, W, AXIS_H);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, contentH);
    ctx.lineTo(W, contentH);
    ctx.stroke();

    // Tick marks
    const rangeUs = this.viewEndUs - this.viewStartUs;
    const rangeS = rangeUs / 1_000_000;
    const intervals = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60];
    let tickS = 1;
    for (const iv of intervals) {
      if (rangeS / iv < 15) {
        tickS = iv;
        break;
      }
    }

    const startTick = Math.ceil(this.viewStartUs / (tickS * 1_000_000));
    const endTick = Math.floor(this.viewEndUs / (tickS * 1_000_000));
    const decimals = tickS < 0.01 ? 3 : tickS < 0.1 ? 2 : tickS < 1 ? 1 : 0;

    ctx.font = '9px monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = startTick; i <= endTick; i++) {
      const tUs = i * tickS * 1_000_000;
      const x = this.timeToX(tUs);
      if (x < GUTTER_W || x > W) continue;
      ctx.beginPath();
      ctx.moveTo(x, contentH);
      ctx.lineTo(x, contentH + 4);
      ctx.stroke();
      ctx.fillText(`${(tUs / 1_000_000).toFixed(decimals)}s`, x, contentH + 5);
    }

    // Range indicator
    const rangeMs = rangeUs / 1_000;
    const rangeLabel = rangeMs < 1000 ? `${rangeMs.toFixed(0)}ms` : `${(rangeMs / 1000).toFixed(1)}s`;
    ctx.font = '9px monospace';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(rangeLabel, W - 4, H - 2);
  }

  private setupInteraction(): void {
    const canvas = this.canvas;

    // Wheel: zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.userHasScrolled = true;

      const range = this.viewEndUs - this.viewStartUs;
      if (e.shiftKey) {
        // Horizontal scroll
        const shift = range * 0.1 * (e.deltaY > 0 ? 1 : -1);
        this.viewStartUs += shift;
        this.viewEndUs += shift;
      } else {
        // Zoom around mouse
        const mouseTime = this.xToTime(e.offsetX);
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        const newRange = Math.max(1_000, Math.min(range * factor, 600_000_000));
        const mouseFrac = (mouseTime - this.viewStartUs) / range;
        this.viewStartUs = mouseTime - mouseFrac * newRange;
        this.viewEndUs = this.viewStartUs + newRange;
      }
    }, { passive: false });

    // Pan
    let panning = false;
    let panLastX = 0;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0 || e.button === 1) {
        e.preventDefault();
        panning = true;
        panLastX = e.offsetX;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (panning) {
        this.userHasScrolled = true;
        const dx = e.offsetX - panLastX;
        const plotW = this.logicalW - GUTTER_W;
        if (plotW > 0) {
          const range = this.viewEndUs - this.viewStartUs;
          const shift = -(dx / plotW) * range;
          this.viewStartUs += shift;
          this.viewEndUs += shift;
        }
        panLastX = e.offsetX;
      } else {
        this.handleHover(e.offsetX, e.offsetY);
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      if (panning) {
        panning = false;
        canvas.releasePointerCapture(e.pointerId);
        canvas.style.cursor = '';
      }
    });

    canvas.addEventListener('pointerleave', () => {
      this.tooltip.style.display = 'none';
      this.hoveredMessage = null;
    });

    canvas.addEventListener('click', (e) => {
      const hit = this.hitTest(e.offsetX, e.offsetY);
      this.selectedMessage = hit;
      this.onMessageSelect?.(hit);
    });
  }

  private handleHover(x: number, y: number): void {
    const hit = this.hitTest(x, y);
    this.hoveredMessage = hit;

    if (hit) {
      this.showTooltip(x, y, hit);
    } else {
      this.tooltip.style.display = 'none';
    }
  }

  private hitTest(mx: number, my: number): TimelineMessage | null {
    const contentH = this.logicalH - AXIS_H;
    if (my > contentH || mx < GUTTER_W) return null;

    const hitRadius = 8;
    let closest: { msg: TimelineMessage; dist: number } | null = null;

    for (const msg of this.messages) {
      const x = this.timeToX(msg.timeUs);
      const rowIdx = this.canIdRowIndex.get(msg.canId) ?? -1;
      if (rowIdx < 0) continue;
      const y = rowIdx * ROW_H + ROW_H / 2;

      const dx = mx - x;
      const dy = my - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < hitRadius && (!closest || dist < closest.dist)) {
        closest = { msg, dist };
      }
    }

    return closest?.msg ?? null;
  }

  private showTooltip(mx: number, my: number, msg: TimelineMessage): void {
    const idStr = '0x' + msg.canId.toString(16).toUpperCase().padStart(3, '0');
    const lines = [
      `CAN ID: ${idStr}`,
      `Time: ${(msg.timeUs / 1_000_000).toFixed(6)}s`,
      `Seq: ${msg.seqno}`,
      `Data: ${msg.dataHex.toUpperCase()}`,
    ];
    if (msg.extended) lines.push('Extended ID');
    if (msg.rtr) lines.push('RTR');
    if (msg.error) lines.push('Error frame');

    this.tooltip.textContent = lines.join('\n');
    this.tooltip.style.display = 'block';
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.tooltip.style.left = Math.min(mx + 12, rect.width - 180) + 'px';
    this.tooltip.style.top = Math.max(4, my - 40) + 'px';
  }
}
