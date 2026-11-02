import type { Usage } from './metrics';
import type { NodeInfo, PodInfo } from './types';

export type SizeMode = 'fixed' | 'mem' | 'cpu';
export type View = 'requests' | 'limits';

export interface NodeBox {
  x: number; y: number; w: number; h: number;
  node: NodeInfo | null; // null = unscheduled bucket
  label: string;
  podCount: number;
  cpuReq: number;
  memReq: number;
  cpuLim: number;
  memLim: number;
  cpuUse: number; // -1 = unknown
  memUse: number;
}
export interface GroupBox { y: number; label: string; nodes: number; pods: number }
export interface Layout {
  height: number;
  groups: GroupBox[];
  nodes: NodeBox[];
  pods: PodInfo[];
  px: Float32Array;
  py: Float32Array;
  ps: Float32Array;
  ucpu: Float32Array; // per-pod usage, -1 = unknown
  umem: Float32Array;
}

export const NODE_W = 220;
export const GROUP_H = 28;
const GAP = 8;
const PAD = 6;
const HEAD = 34;
const CELL_GAP = 2;
const MARGIN = 12;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function podSide(p: PodInfo, mode: SizeMode, view: View): number {
  if (mode === 'fixed') return 12;
  const lim = view === 'limits';
  const v = mode === 'mem' ? (lim ? p.memLim : p.memReq) / 2 ** 31 : (lim ? p.cpuLim : p.cpuReq) / 2000;
  return clamp(7 + 26 * Math.sqrt(v), 7, 40);
}

export function groupLabelKeys(nodes: Iterable<NodeInfo>): string[] {
  const counts = new Map<string, Set<string>>();
  let total = 0;
  for (const n of nodes) {
    total++;
    for (const [k, v] of Object.entries(n.labels)) {
      let s = counts.get(k);
      if (!s) counts.set(k, (s = new Set()));
      s.add(v);
    }
  }
  const useful = [...counts].filter(([, s]) => s.size > 1 && s.size < total);
  const rest = [...counts].filter(([, s]) => !(s.size > 1 && s.size < total));
  useful.sort((a, b) => a[1].size - b[1].size);
  return [...useful, ...rest].map(([k]) => k);
}

export function computeLayout(
  nodes: Map<string, NodeInfo>,
  pods: Iterable<PodInfo>,
  opts: { width: number; groupBy: string; size: SizeMode; view?: View; usage?: Usage },
): Layout {
  const byNode = new Map<string, PodInfo[]>();
  const unscheduled: PodInfo[] = [];
  for (const p of pods) {
    if (p.node && nodes.has(p.node)) {
      let a = byNode.get(p.node);
      if (!a) byNode.set(p.node, (a = []));
      a.push(p);
    } else unscheduled.push(p);
  }

  const groups = new Map<string, NodeInfo[]>();
  for (const n of nodes.values()) {
    const g = opts.groupBy ? n.labels[opts.groupBy] ?? '(no label)' : '';
    let a = groups.get(g);
    if (!a) groups.set(g, (a = []));
    a.push(n);
  }
  const groupKeys = [...groups.keys()].sort();

  const out: Layout = { height: 0, groups: [], nodes: [], pods: [], px: new Float32Array(0), py: new Float32Array(0), ps: new Float32Array(0), ucpu: new Float32Array(0), umem: new Float32Array(0) };
  const px: number[] = [];
  const py: number[] = [];
  const ps: number[] = [];
  const ucpu: number[] = [];
  const umem: number[] = [];
  const innerW = NODE_W - PAD * 2;
  const perRow = Math.max(1, Math.floor((opts.width - MARGIN * 2 + GAP) / (NODE_W + GAP)));

  const placeNode = (node: NodeInfo | null, label: string, list: PodInfo[], x: number, y: number): NodeBox => {
    list.sort((a, b) => (a.ns < b.ns ? -1 : a.ns > b.ns ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    let cx = 0;
    let cy = 0;
    let rowH = 0;
    let cpu = 0;
    let mem = 0;
    let cpuL = 0;
    let memL = 0;
    for (const p of list) {
      const u = opts.usage?.pods.get(`${p.ns}/${p.name}`);
      const s = podSide(p, opts.size, opts.view ?? 'requests');
      ucpu.push(u ? u.cpu : -1);
      umem.push(u ? u.mem : -1);
      if (cx > 0 && cx + s > innerW) { cx = 0; cy += rowH + CELL_GAP; rowH = 0; }
      px.push(x + PAD + cx);
      py.push(y + HEAD + cy);
      ps.push(s);
      out.pods.push(p);
      cx += s + CELL_GAP;
      rowH = Math.max(rowH, s);
      if (p.holds) { cpu += p.cpuReq; mem += p.memReq; cpuL += p.cpuLim; memL += p.memLim; }
    }
    const h = HEAD + (list.length ? cy + rowH : 0) + PAD;
    const nu = node ? opts.usage?.nodes.get(node.name) : undefined;
    return { x, y, w: NODE_W, h, node, label, podCount: list.length, cpuReq: cpu, memReq: mem, cpuLim: cpuL, memLim: memL, cpuUse: nu ? nu.cpu : -1, memUse: nu ? nu.mem : -1 };
  };

  let y = MARGIN;
  const flow = (items: Array<{ node: NodeInfo | null; label: string; list: PodInfo[] }>) => {
    for (let i = 0; i < items.length; i += perRow) {
      const row = items.slice(i, i + perRow).map((it, j) => placeNode(it.node, it.label, it.list, MARGIN + j * (NODE_W + GAP), y));
      const rh = Math.max(...row.map((b) => b.h));
      for (const b of row) { b.h = rh; out.nodes.push(b); }
      y += rh + GAP;
    }
  };

  for (const g of groupKeys) {
    const ns = groups.get(g)!.sort((a, b) => (a.name < b.name ? -1 : 1));
    if (opts.groupBy) {
      const pc = ns.reduce((s, n) => s + (byNode.get(n.name)?.length ?? 0), 0);
      out.groups.push({ y, label: `${opts.groupBy} = ${g}`, nodes: ns.length, pods: pc });
      y += GROUP_H;
    }
    flow(ns.map((n) => ({ node: n, label: n.name, list: byNode.get(n.name) ?? [] })));
    y += 4;
  }
  if (unscheduled.length) {
    out.groups.push({ y, label: 'unscheduled / unknown node', nodes: 0, pods: unscheduled.length });
    y += GROUP_H;
    flow([{ node: null, label: 'unscheduled', list: unscheduled }]);
  }

  out.height = y + MARGIN;
  out.px = Float32Array.from(px);
  out.py = Float32Array.from(py);
  out.ps = Float32Array.from(ps);
  out.ucpu = Float32Array.from(ucpu);
  out.umem = Float32Array.from(umem);
  return out;
}
