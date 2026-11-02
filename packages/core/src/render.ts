import { GROUP_H, type Layout, type View } from './layout';
import type { PodInfo, StatusClass } from './types';

const STATUS_COLOR: Record<StatusClass, string> = {
  ok: '#3fb950',
  notready: '#d29922',
  pending: '#58a6ff',
  done: '#6e7681',
  error: '#f85149',
  terminating: '#bc8cff',
};

const nsColorCache = new Map<string, string>();
function nsColor(ns: string): string {
  let c = nsColorCache.get(ns);
  if (!c) {
    let h = 0;
    for (let i = 0; i < ns.length; i++) h = (h * 31 + ns.charCodeAt(i)) >>> 0;
    c = `hsl(${h % 360} 55% 52%)`;
    nsColorCache.set(ns, c);
  }
  return c;
}

export interface Theme {
  track: string; mark: string; groupText: string;
  nodeBg: string; nodeBgBad: string; nodeBorder: string; nodeBorderBad: string;
  nodeText: string; nodeTextCordoned: string;
}
export const DARK: Theme = {
  track: '#263039', mark: '#ffffff', groupText: '#8a97a3',
  nodeBg: '#161c23', nodeBgBad: '#2a1618', nodeBorder: '#263039', nodeBorderBad: '#6e2a2e',
  nodeText: '#c9d1d9', nodeTextCordoned: '#d29922',
};
export const LIGHT: Theme = {
  track: '#d8dee4', mark: '#1f2328', groupText: '#59636e',
  nodeBg: '#f6f8fa', nodeBgBad: '#ffebe9', nodeBorder: '#d1d9e0', nodeBorderBad: '#ff8182',
  nodeText: '#1f2328', nodeTextCordoned: '#9a6700',
};

export type ColorMode = 'status' | 'ns';

export interface DrawOpts {
  layout: Layout;
  scrollY: number;
  w: number;
  h: number;
  dpr: number;
  color: ColorMode;
  view?: View;
  theme?: Theme;
  match: ((p: PodInfo) => boolean) | null;
}

function bar(ctx: CanvasRenderingContext2D, t: Theme, x: number, y: number, w: number, frac: number, useFrac: number) {
  ctx.fillStyle = t.track;
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = frac > 1 ? '#f85149' : frac > 0.85 ? '#d29922' : '#58a6ff';
  ctx.fillRect(x, y, Math.min(1, frac) * w, 3);
  if (useFrac >= 0) {
    ctx.fillStyle = t.mark;
    ctx.fillRect(x + Math.min(1, useFrac) * w - 1, y - 1, 2, 5);
  }
}

export function draw(ctx: CanvasRenderingContext2D, o: DrawOpts) {
  const { layout: L, scrollY, w, h } = o;
  const t = o.theme ?? DARK;
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.translate(0, -scrollY);
  const top = scrollY;
  const bot = scrollY + h;

  ctx.textBaseline = 'top';
  ctx.font = '600 13px system-ui, sans-serif';
  for (const g of L.groups) {
    if (g.y + GROUP_H < top || g.y > bot) continue;
    ctx.fillStyle = t.groupText;
    ctx.fillText(`${g.label}   ·   ${g.nodes} nodes · ${g.pods} pods`, 12, g.y + 6);
  }

  ctx.font = '11px ui-monospace, monospace';
  const lim = o.view === 'limits';
  for (const b of L.nodes) {
    if (b.y + b.h < top || b.y > bot) continue;
    ctx.fillStyle = b.node && !b.node.ready ? t.nodeBgBad : t.nodeBg;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.node && !b.node.ready ? t.nodeBorderBad : t.nodeBorder;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.fillStyle = b.node?.unschedulable ? t.nodeTextCordoned : t.nodeText;
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x + 6, b.y, b.w - 12, 16);
    ctx.clip();
    ctx.fillText(b.label, b.x + 6, b.y + 4);
    ctx.restore();
    if (b.node) {
      if (b.node.cpuAlloc) bar(ctx, t, b.x + 6, b.y + 19, b.w - 12, (lim ? b.cpuLim : b.cpuReq) / b.node.cpuAlloc, b.cpuUse < 0 ? -1 : b.cpuUse / b.node.cpuAlloc);
      if (b.node.memAlloc) bar(ctx, t, b.x + 6, b.y + 25, b.w - 12, (lim ? b.memLim : b.memReq) / b.node.memAlloc, b.memUse < 0 ? -1 : b.memUse / b.node.memAlloc);
    }
  }

  const { pods, px, py, ps } = L;
  const match = o.match;
  for (let i = 0; i < pods.length; i++) {
    const y = py[i];
    const s = ps[i];
    if (y + s < top || y > bot) continue;
    const p = pods[i];
    ctx.globalAlpha = match && !match(p) ? 0.12 : 1;
    ctx.fillStyle = o.color === 'ns' ? nsColor(p.ns) : STATUS_COLOR[p.cls];
    ctx.fillRect(px[i], y, s, s);
    if (o.color === 'ns' && p.cls !== 'ok' && p.cls !== 'done') {
      ctx.fillStyle = STATUS_COLOR[p.cls];
      ctx.fillRect(px[i], y, s, 3);
    }
  }
  ctx.globalAlpha = 1;
}

export function hitPod(L: Layout, x: number, y: number): number {
  const { px, py, ps } = L;
  for (let i = 0; i < ps.length; i++) {
    if (x >= px[i] && x < px[i] + ps[i] && y >= py[i] && y < py[i] + ps[i]) return i;
  }
  return -1;
}

export function hitNode(L: Layout, x: number, y: number) {
  return L.nodes.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
}
