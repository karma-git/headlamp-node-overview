import type { Layout, NodeBox } from './layout';

const mem = (b: number) => (b > 0 ? (b >= 2 ** 30 ? `${(b / 2 ** 30).toFixed(1)}Gi` : `${Math.round(b / 2 ** 20)}Mi`) : '-');
const cpu = (m: number) => (m > 0 ? `${m}m` : '-');
const pct = (v: number, of: number) => (of > 0 && v >= 0 ? ` (${Math.round((v / of) * 100)}%)` : '');
const col = (s: string, w: number) => s.padEnd(w);

export function nodeTip(b: NodeBox): string {
  const n = b.node;
  if (!n) return '';
  const head = `${n.name}${n.ready ? '' : '  NOT READY'}${n.unschedulable ? '  cordoned' : ''}\npods ${b.podCount}/${n.podsAlloc}`;
  const row = (label: string, c: number, m: number, withPct: boolean) =>
    `${col(label, 9)}${col(cpu(c) + (withPct ? pct(c, n.cpuAlloc) : ''), 16)}${mem(m)}${withPct ? pct(m, n.memAlloc) : ''}`;
  const lines = [
    head,
    `${col('', 9)}${col('cpu', 16)}mem`,
    row('alloc', n.cpuAlloc, n.memAlloc, false),
    row('requests', b.cpuReq, b.memReq, true),
    row('limits', b.cpuLim, b.memLim, true),
    b.cpuUse >= 0 ? row('usage', b.cpuUse, b.memUse, true) : `${col('usage', 9)}n/a (no metrics-server)`,
  ];
  return lines.join('\n');
}

export function podTip(L: Layout, i: number): string {
  const p = L.pods[i];
  const uc = L.ucpu[i];
  const um = L.umem[i];
  const row = (label: string, c: number, m: number) => `${col(label, 9)}${col(cpu(c), 8)}${mem(m)}`;
  return [
    `${p.ns}/${p.name}`,
    `status   ${p.status} (${p.ready} ready) · restarts ${p.restarts}`,
    `node     ${p.node || '-'}`,
    `owner    ${p.owner || '-'}`,
    `${col('', 9)}${col('cpu', 8)}mem`,
    row('requests', p.cpuReq, p.memReq),
    row('limits', p.cpuLim, p.memLim),
    uc >= 0 ? row('usage', uc, um) : `${col('usage', 9)}n/a`,
  ].join('\n');
}
