import { describe, expect, it } from 'vitest';
import { parseQuantity, toNode, toPod } from './convert';
import { compileQuery } from './filter';
import { computeLayout, groupLabelKeys } from './layout';
import { parseNodeMetrics, parsePodMetrics } from './metrics';
import type { NodeInfo } from './types';

const pod = (over: any = {}) => ({
  metadata: { uid: 'u1', name: 'web-1', namespace: 'shop', ownerReferences: [{ kind: 'ReplicaSet' }], ...over.metadata },
  spec: {
    nodeName: 'n1',
    containers: [{ resources: { requests: { cpu: '250m', memory: '128Mi' }, limits: { cpu: '1', memory: '256Mi' } } }],
    ...over.spec,
  },
  status: {
    phase: 'Running',
    containerStatuses: [{ ready: true, restartCount: 2, state: { running: {} } }],
    ...over.status,
  },
});

describe('parseQuantity', () => {
  it('handles decimal, binary and exponent suffixes', () => {
    expect(parseQuantity('250m')).toBeCloseTo(0.25);
    expect(parseQuantity('1Gi')).toBe(2 ** 30);
    expect(parseQuantity('1k')).toBe(1000);
    expect(parseQuantity('1e3')).toBe(1000);
    expect(parseQuantity('100n')).toBeCloseTo(1e-7);
  });
  it('returns 0 for missing or invalid values', () => {
    expect(parseQuantity(undefined)).toBe(0);
    expect(parseQuantity('abc')).toBe(0);
  });
});

describe('toNode', () => {
  it('reads readiness and allocatable', () => {
    const n = toNode({
      metadata: { name: 'n1', labels: { zone: 'a' } },
      spec: { unschedulable: true },
      status: { conditions: [{ type: 'Ready', status: 'True' }], allocatable: { cpu: '4', memory: '8Gi', pods: '110' } },
    });
    expect(n).toMatchObject({ name: 'n1', ready: true, unschedulable: true, cpuAlloc: 4000, memAlloc: 8 * 2 ** 30, podsAlloc: 110 });
  });
});

describe('toPod', () => {
  it('converts a running pod', () => {
    const p = toPod(pod());
    expect(p).toMatchObject({ status: 'Running', cls: 'ok', ready: '1/1', restarts: 2, cpuReq: 250, memReq: 128 * 2 ** 20, cpuLim: 1000, owner: 'ReplicaSet', holds: true });
  });
  it('reports waiting reasons and terminating', () => {
    expect(toPod(pod({ status: { containerStatuses: [{ ready: false, state: { waiting: { reason: 'CrashLoopBackOff' } } }] } })).cls).toBe('error');
    expect(toPod(pod({ metadata: { deletionTimestamp: 'x' } })).cls).toBe('terminating');
    expect(toPod(pod({ status: { phase: 'Succeeded', containerStatuses: [] } }))).toMatchObject({ status: 'Completed', cls: 'done', holds: false });
  });
  it('counts sidecars and the largest init container like the scheduler', () => {
    const p = toPod(
      pod({
        spec: {
          initContainers: [
            { resources: { requests: { cpu: '2' } } },
            { restartPolicy: 'Always', resources: { requests: { cpu: '100m' } } },
          ],
          overhead: { cpu: '50m' },
        },
      }),
    );
    expect(p.cpuReq).toBe(2000 + 50); // max(250 + 100, 2000) + overhead
  });
});

describe('compileQuery', () => {
  const p = toPod(pod());
  it('returns null for an empty query', () => expect(compileQuery('  ')).toBeNull());
  it('ANDs tokens and supports prefixes', () => {
    expect(compileQuery('ns:shop web')!(p)).toBe(true);
    expect(compileQuery('ns:shop node:n2')!(p)).toBe(false);
    expect(compileQuery('status:run owner:replica')!(p)).toBe(true);
  });
  it('supports is:noreq and is:nolimit', () => {
    const bare = toPod(pod({ spec: { containers: [{}] } }));
    expect(compileQuery('is:noreq')!(bare)).toBe(true);
    expect(compileQuery('is:nolimit')!(p)).toBe(false);
  });
});

describe('layout', () => {
  const node = (name: string, zone: string): NodeInfo => ({ name, labels: { zone, os: 'linux' }, ready: true, unschedulable: false, cpuAlloc: 4000, memAlloc: 2 ** 33, podsAlloc: 110 });
  const nodes = new Map([['n1', node('n1', 'a')], ['n2', node('n2', 'b')]]);

  it('prefers labels that split nodes into groups', () => {
    expect(groupLabelKeys(nodes.values())[0]).toBe('zone');
  });
  it('places pods on their nodes and collects unscheduled ones', () => {
    const pods = [toPod(pod()), toPod(pod({ metadata: { uid: 'u2', name: 'pending' }, spec: { nodeName: undefined } }))];
    const L = computeLayout(nodes, pods, { width: 1000, groupBy: 'zone', size: 'fixed' });
    expect(L.groups.map((g) => g.label)).toEqual(['zone = a', 'zone = b', 'unscheduled / unknown node']);
    expect(L.pods).toHaveLength(2);
    expect(L.nodes.find((b) => b.node?.name === 'n1')).toMatchObject({ podCount: 1, cpuReq: 250 });
  });
});

describe('metrics', () => {
  it('sums container usage per pod', () => {
    const m = parsePodMetrics({ items: [{ metadata: { namespace: 'a', name: 'p' }, containers: [{ usage: { cpu: '100m', memory: '1Mi' } }, { usage: { cpu: '50m', memory: '1Mi' } }] }] });
    expect(m.get('a/p')).toEqual({ cpu: 150, mem: 2 * 2 ** 20 });
    expect(parseNodeMetrics({ items: [{ metadata: { name: 'n' }, usage: { cpu: '1', memory: '1Gi' } }] }).get('n')).toEqual({ cpu: 1000, mem: 2 ** 30 });
  });
});
