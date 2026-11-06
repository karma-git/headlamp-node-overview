import { ClusterState } from './state';
import { MetricsPoller } from './metrics';
import {
  compileQuery, computeLayout, groupLabelKeys, draw, hitNode, hitPod, nodeTip, podTip,
  type ColorMode, type Layout, type SizeMode, type View,
} from '@node-overview/core';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const wrap = $<HTMLDivElement>('wrap');
const canvas = $<HTMLCanvasElement>('c');
const ctx = canvas.getContext('2d')!;
const q = $<HTMLInputElement>('q');
const groupSel = $<HTMLSelectElement>('group');
const sizeSel = $<HTMLSelectElement>('size');
const colorSel = $<HTMLSelectElement>('color');
const stat = $('stat');
const viewSel = $<HTMLSelectElement>('view');
const tip = $('tip');

const hash = new URLSearchParams(location.hash.slice(1));
q.value = hash.get('q') ?? '';
sizeSel.value = hash.get('size') ?? 'fixed';
colorSel.value = hash.get('color') ?? 'status';
viewSel.value = hash.get('view') ?? 'requests';
let groupBy = hash.get('group') ?? '';

let layout: Layout | null = null;
let layoutVersion = -1;
let layoutKey = '';
let scrollY = 0;
let dirty = true;
let groupKeysSig = '';

const state = new ClusterState(() => { dirty = true; });
state.start();
const metrics = new MetricsPoller(() => { dirty = true; });
metrics.start();

function syncHash() {
  const p = new URLSearchParams();
  if (q.value) p.set('q', q.value);
  if (groupBy) p.set('group', groupBy);
  if (sizeSel.value !== 'fixed') p.set('size', sizeSel.value);
  if (colorSel.value !== 'status') p.set('color', colorSel.value);
  if (viewSel.value !== 'requests') p.set('view', viewSel.value);
  history.replaceState(null, '', '#' + p.toString());
}

function refreshGroupOptions() {
  const keys = groupLabelKeys(state.nodes.values());
  const sig = keys.join('|');
  if (sig === groupKeysSig) return;
  groupKeysSig = sig;
  groupSel.replaceChildren(new Option('(none)', ''), ...keys.map((k) => new Option(k, k)));
  groupSel.value = groupBy;
}

let dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  dirty = true;
}
new ResizeObserver(resize).observe(wrap);

function frame() {
  requestAnimationFrame(frame);
  if (!dirty) return;
  dirty = false;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;

  refreshGroupOptions();
  const key = `${groupBy}|${sizeSel.value}|${viewSel.value}|${w}|${metrics.version}`;
  if (!layout || layoutVersion !== state.version || layoutKey !== key) {
    layout = computeLayout(state.nodes, state.pods.values(), { width: w, groupBy, size: sizeSel.value as SizeMode, view: viewSel.value as View, usage: metrics.usage });
    layoutVersion = state.version;
    layoutKey = key;
  }
  scrollY = Math.max(0, Math.min(scrollY, layout.height - h));
  const match = compileQuery(q.value);
  draw(ctx, { layout, scrollY, w, h, dpr, color: colorSel.value as ColorMode, view: viewSel.value as View, match });

  let matched = state.pods.size;
  if (match) { matched = 0; for (const p of state.pods.values()) if (match(p)) matched++; }
  const live = state.conn.nodes === 'live' && state.conn.pods === 'live';
  stat.textContent = state.error
    ? `error: ${state.error}`
    : `${state.nodes.size} nodes · ${state.pods.size} pods${match ? ` · ${matched} match` : ''} · ${live ? 'live' : 'syncing…'}${metrics.error ? ` · ${metrics.error}` : ''}`;
}
requestAnimationFrame(frame);

q.addEventListener('input', () => { dirty = true; syncHash(); });
groupSel.addEventListener('change', () => { groupBy = groupSel.value; dirty = true; syncHash(); });
sizeSel.addEventListener('change', () => { dirty = true; syncHash(); });
const relabelSize = () => {
  const sfx = viewSel.value === 'limits' ? 'limit' : 'req';
  sizeSel.options[1].text = `memory ${sfx}`;
  sizeSel.options[2].text = `cpu ${sfx}`;
};
relabelSize();
viewSel.addEventListener('change', () => { relabelSize(); dirty = true; syncHash(); });
colorSel.addEventListener('change', () => { dirty = true; syncHash(); });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); scrollY += e.deltaY; dirty = true; }, { passive: false });

canvas.addEventListener('mousemove', (e) => {
  if (!layout) return;
  const x = e.offsetX;
  const y = e.offsetY + scrollY;
  const i = hitPod(layout, x, y);
  let text = '';
  if (i >= 0) text = podTip(layout, i);
  else {
    const b = hitNode(layout, x, y);
    if (b?.node) text = nodeTip(b);
  }
  if (!text) { tip.style.display = 'none'; return; }
  tip.textContent = text;
  tip.style.display = 'block';
  tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 300) + 'px';
  tip.style.top = e.clientY + 14 + 'px';
});
canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
