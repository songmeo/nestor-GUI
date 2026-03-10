// ---------------------------------------------------------------------------
// Canvas 2D renderer — displays devices as nodes (Gerasim-style)
// ---------------------------------------------------------------------------

import type { DeviceNode, Record } from './types';
import { getCanIdColor } from './types';
import { Viewport } from './viewport';

const C_BG = '#000000';
const C_NODE_BG = '#2a2a2a';
const C_NODE_BORDER = '#555';
const C_NODE_SELECTED = '#3498db';
const C_NODE_ONLINE = '#27ae60';
const C_NODE_OFFLINE = '#555';
const C_TEXT = '#fff';
const C_TEXT_DIM = '#888';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 100;
const NODE_RADIUS = 8;

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private viewport: Viewport;
  private tooltip: HTMLElement;

  private devices: DeviceNode[] = [];
  private selectedDevice: string | null = null;
  private recentMessages: { x: number; y: number; color: string; alpha: number }[] = [];

  onDeviceClick: ((device: string) => void) | null = null;
  onDeviceHover: ((device: string | null) => void) | null = null;

  private get logicalW(): number {
    return this.canvas.width / (window.devicePixelRatio || 1);
  }
  private get logicalH(): number {
    return this.canvas.height / (window.devicePixelRatio || 1);
  }

  constructor(canvas: HTMLCanvasElement, viewport: Viewport, tooltip: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.viewport = viewport;
    this.tooltip = tooltip;
    this.setupInteraction();
  }

  setDevices(devices: DeviceNode[]): void {
    this.devices = devices;
    this.layoutDevices();
  }

  setSelectedDevice(device: string | null): void {
    this.selectedDevice = device;
  }

  addMessageFlash(deviceName: string, record: Record): void {
    const device = this.devices.find(d => d.device === deviceName);
    if (!device) return;

    const color = getCanIdColor(record.frame.can_id);
    // Add a flash particle that will fade out
    this.recentMessages.push({
      x: device.x + NODE_WIDTH / 2 + (Math.random() - 0.5) * 60,
      y: device.y + NODE_HEIGHT / 2 + (Math.random() - 0.5) * 40,
      color,
      alpha: 1.0,
    });

    // Keep only recent flashes
    if (this.recentMessages.length > 100) {
      this.recentMessages = this.recentMessages.slice(-50);
    }
  }

  private layoutDevices(): void {
    const n = this.devices.length;
    if (n === 0) return;

    if (n === 1) {
      // Single device in center
      this.devices[0].x = 0;
      this.devices[0].y = 0;
    } else {
      // Arrange in a circle (like Gerasim)
      const radius = Math.max(200, n * 120 / (2 * Math.PI));
      for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        this.devices[i].x = radius * Math.cos(angle) - NODE_WIDTH / 2;
        this.devices[i].y = radius * Math.sin(angle) - NODE_HEIGHT / 2;
      }
    }

    // Fit view to show all devices
    this.fitView();
  }

  fitView(): void {
    if (this.devices.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const d of this.devices) {
      if (d.x < minX) minX = d.x;
      if (d.y < minY) minY = d.y;
      if (d.x + NODE_WIDTH > maxX) maxX = d.x + NODE_WIDTH;
      if (d.y + NODE_HEIGHT > maxY) maxY = d.y + NODE_HEIGHT;
    }

    this.viewport.fitBounds(minX, minY, maxX, maxY, this.logicalW, this.logicalH);
  }

  render(): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const W = this.logicalW;
    const H = this.logicalH;

    // Clear with identity transform
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, W, H);

    // Apply viewport transform
    this.viewport.applyToCanvas(ctx, dpr);

    // Draw bus connections between devices (behind everything)
    this.drawBusConnections(ctx);

    // Update and draw message flashes (behind nodes)
    this.updateFlashes();
    this.drawFlashes(ctx);

    // Draw devices
    for (const device of this.devices) {
      this.drawDevice(ctx, device);
    }

    // Draw "No devices" message if empty
    if (this.devices.length === 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = C_TEXT_DIM;
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No devices connected', W / 2, H / 2);
    }
  }

  private drawBusConnections(ctx: CanvasRenderingContext2D): void {
    if (this.devices.length < 2) return;

    // Draw connections between all devices (assuming same bus)
    // Style: subtle dashed lines like Gerasim's peer connections
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    const centerX = (d: DeviceNode) => d.x + NODE_WIDTH / 2;
    const centerY = (d: DeviceNode) => d.y + NODE_HEIGHT / 2;

    // Connect each device to its neighbors in the circle
    for (let i = 0; i < this.devices.length; i++) {
      const a = this.devices[i];
      const b = this.devices[(i + 1) % this.devices.length];

      ctx.beginPath();
      ctx.moveTo(centerX(a), centerY(a));
      ctx.lineTo(centerX(b), centerY(b));
      ctx.stroke();
    }

    // Reset line dash
    ctx.setLineDash([]);
  }

  private drawDevice(ctx: CanvasRenderingContext2D, device: DeviceNode): void {
    const isSelected = device.device === this.selectedDevice;
    const x = device.x;
    const y = device.y;

    // Node background
    ctx.fillStyle = C_NODE_BG;
    ctx.strokeStyle = isSelected ? C_NODE_SELECTED : C_NODE_BORDER;
    ctx.lineWidth = isSelected ? 2 : 1;

    ctx.beginPath();
    ctx.roundRect(x, y, NODE_WIDTH, NODE_HEIGHT, NODE_RADIUS);
    ctx.fill();
    ctx.stroke();

    // Status indicator
    const statusColor = device.isOnline ? C_NODE_ONLINE : C_NODE_OFFLINE;
    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(x + 12, y + 12, 5, 0, Math.PI * 2);
    ctx.fill();

    // Device name
    ctx.fillStyle = C_TEXT;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(this.truncate(device.device, 18), x + 24, y + 8);

    // UID
    ctx.fillStyle = C_TEXT_DIM;
    ctx.font = '10px monospace';
    ctx.fillText(`UID: ${device.lastUid.toString(16).toUpperCase()}`, x + 8, y + 32);

    // Last heard
    const lastHeard = this.formatTimeAgo(device.lastHeardTs);
    ctx.fillText(`Last: ${lastHeard}`, x + 8, y + 48);

    // Boot count
    ctx.fillText(`Boots: ${device.bootCount < 0 ? '—' : device.bootCount}`, x + 8, y + 64);

    // Selection indicator
    if (isSelected) {
      ctx.fillStyle = C_NODE_SELECTED;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('●', x + NODE_WIDTH - 8, y + 8);
    }
  }

  private drawFlashes(ctx: CanvasRenderingContext2D): void {
    for (const flash of this.recentMessages) {
      if (flash.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = flash.alpha;
      ctx.fillStyle = flash.color;
      ctx.beginPath();
      ctx.arc(flash.x, flash.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private updateFlashes(): void {
    for (const flash of this.recentMessages) {
      flash.alpha -= 0.02;
    }
    this.recentMessages = this.recentMessages.filter(f => f.alpha > 0);
  }

  private truncate(s: string, maxLen: number): string {
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + '…';
  }

  private formatTimeAgo(ts: number): string {
    const now = Date.now() / 1000;
    const diff = now - ts;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  private setupInteraction(): void {
    this.canvas.addEventListener('mousemove', (e) => {
      this.handleHover(e.offsetX, e.offsetY);
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.tooltip.style.display = 'none';
      this.onDeviceHover?.(null);
    });

    this.canvas.addEventListener('click', (e) => {
      const hit = this.hitTest(e.offsetX, e.offsetY);
      if (hit) {
        this.onDeviceClick?.(hit.device);
      }
    });
  }

  private handleHover(mx: number, my: number): void {
    const hit = this.hitTest(mx, my);

    if (hit) {
      this.onDeviceHover?.(hit.device);
      this.showTooltip(mx, my, hit);
    } else {
      this.tooltip.style.display = 'none';
      this.onDeviceHover?.(null);
    }
  }

  private hitTest(mx: number, my: number): DeviceNode | null {
    const world = this.viewport.screenToWorld(mx, my);

    for (const device of this.devices) {
      if (
        world.x >= device.x &&
        world.x <= device.x + NODE_WIDTH &&
        world.y >= device.y &&
        world.y <= device.y + NODE_HEIGHT
      ) {
        return device;
      }
    }

    return null;
  }

  private showTooltip(mx: number, my: number, device: DeviceNode): void {
    const lines = [
      `Device: ${device.device}`,
      `UID: 0x${device.lastUid.toString(16).toUpperCase()}`,
      `Last heard: ${new Date(device.lastHeardTs * 1000).toLocaleString()}`,
      `Boot sessions: ${device.bootCount < 0 ? '(click to load)' : device.bootCount}`,
      `Status: ${device.isOnline ? 'Online' : 'Offline'}`,
    ];

    this.tooltip.textContent = lines.join('\n');
    this.tooltip.style.display = 'block';
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.tooltip.style.left = Math.min(mx + 16, rect.width - 220) + 'px';
    this.tooltip.style.top = Math.max(4, my - 20) + 'px';
  }
}
