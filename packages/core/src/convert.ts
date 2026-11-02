import type { NodeInfo, PodInfo, StatusClass } from './types';

const SUFFIX: Record<string, number> = {
  n: 1e-9, u: 1e-6, m: 1e-3, '': 1,
  k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18,
  Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6,
};

export function parseQuantity(q: unknown): number {
  if (typeof q !== 'string') return 0;
  const m = /^([0-9.]+(?:[eE][+-]?\d+)?)([A-Za-z]*)$/.exec(q);
  if (!m) return 0;
  return parseFloat(m[1]) * (SUFFIX[m[2]] ?? 1);
}

const cpuMilli = (q: unknown) => Math.round(parseQuantity(q) * 1000);

/* eslint-disable @typescript-eslint/no-explicit-any */
export function toNode(n: any): NodeInfo {
  const ready = (n.status?.conditions ?? []).some((c: any) => c.type === 'Ready' && c.status === 'True');
  const a = n.status?.allocatable ?? {};
  return {
    name: n.metadata.name,
    labels: n.metadata.labels ?? {},
    ready,
    unschedulable: !!n.spec?.unschedulable,
    cpuAlloc: cpuMilli(a.cpu),
    memAlloc: parseQuantity(a.memory),
    podsAlloc: parseInt(a.pods ?? '0', 10),
  };
}

function classify(status: string, phase: string, ready: boolean): StatusClass {
  if (status === 'Terminating') return 'terminating';
  if (status === 'Completed' || phase === 'Succeeded') return 'done';
  if (status === 'Running') return ready ? 'ok' : 'notready';
  if (status === 'Pending' || status === 'ContainerCreating' || status === 'PodInitializing' || status.startsWith('Init:') && !/Error|BackOff|Crash/.test(status)) return 'pending';
  return 'error';
}

// as the scheduler counts it: max(sum(containers + sidecars), max(init)) + overhead
function effective(spec: any, kind: 'requests' | 'limits'): { cpu: number; mem: number } {
  let cpu = 0;
  let mem = 0;
  for (const c of spec.containers ?? []) {
    cpu += cpuMilli(c.resources?.[kind]?.cpu);
    mem += parseQuantity(c.resources?.[kind]?.memory);
  }
  let initCpu = 0;
  let initMem = 0;
  for (const c of spec.initContainers ?? []) {
    const ic = cpuMilli(c.resources?.[kind]?.cpu);
    const im = parseQuantity(c.resources?.[kind]?.memory);
    if (c.restartPolicy === 'Always') { cpu += ic; mem += im; }
    else { initCpu = Math.max(initCpu, ic); initMem = Math.max(initMem, im); }
  }
  const oh = kind === 'requests' ? spec.overhead : undefined;
  return {
    cpu: Math.max(cpu, initCpu) + cpuMilli(oh?.cpu),
    mem: Math.max(mem, initMem) + parseQuantity(oh?.memory),
  };
}

export function toPod(p: any): PodInfo {
  const st = p.status ?? {};
  const spec = p.spec ?? {};
  let status: string = st.reason || st.phase || 'Unknown';

  for (const c of st.initContainerStatuses ?? []) {
    const t = c.state?.terminated;
    if (t && t.exitCode === 0) continue;
    if (t) { status = 'Init:' + (t.reason || 'Error'); break; }
    const w = c.state?.waiting;
    if (w && w.reason !== 'PodInitializing') { status = 'Init:' + w.reason; break; }
  }
  const cs: any[] = st.containerStatuses ?? [];
  let readyN = 0;
  let restarts = 0;
  for (const c of cs) {
    if (c.ready) readyN++;
    restarts += c.restartCount ?? 0;
    const w = c.state?.waiting;
    const t = c.state?.terminated;
    if (w?.reason) status = w.reason;
    else if (t?.reason && t.exitCode !== 0) status = t.reason;
  }
  if (st.phase === 'Succeeded') status = 'Completed';
  if (p.metadata.deletionTimestamp) status = 'Terminating';

  const req = effective(spec, 'requests');
  const lim = effective(spec, 'limits');

  const total = (spec.containers ?? []).length;
  const owner = p.metadata.ownerReferences?.[0]?.kind ?? '';
  const ns = p.metadata.namespace ?? '';
  const node = spec.nodeName ?? '';
  return {
    uid: p.metadata.uid,
    name: p.metadata.name,
    ns,
    node,
    status,
    cls: classify(status, st.phase, total > 0 && readyN === total),
    ready: `${readyN}/${total}`,
    restarts,
    cpuReq: req.cpu,
    memReq: req.mem,
    cpuLim: lim.cpu,
    memLim: lim.mem,
    holds: st.phase !== 'Succeeded' && st.phase !== 'Failed',
    owner,
    hay: `${ns}/${p.metadata.name} ${node} ${status} ${owner}`.toLowerCase(),
  };
}
