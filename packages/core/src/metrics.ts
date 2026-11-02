import { parseQuantity } from './convert';

export interface Use { cpu: number; mem: number } // millicores, bytes
export interface Usage {
  nodes: Map<string, Use>; // by node name
  pods: Map<string, Use>; // by "ns/name"
}

export const emptyUsage = (): Usage => ({ nodes: new Map(), pods: new Map() });

/* eslint-disable @typescript-eslint/no-explicit-any */
const use = (u: any): Use => ({
  cpu: Math.round(parseQuantity(u?.cpu) * 1000),
  mem: parseQuantity(u?.memory),
});

export function parseNodeMetrics(list: any): Map<string, Use> {
  const m = new Map<string, Use>();
  for (const i of list?.items ?? []) m.set(i.metadata.name, use(i.usage));
  return m;
}

export function parsePodMetrics(list: any): Map<string, Use> {
  const m = new Map<string, Use>();
  for (const i of list?.items ?? []) {
    let cpu = 0;
    let mem = 0;
    for (const c of i.containers ?? []) {
      const u = use(c.usage);
      cpu += u.cpu;
      mem += u.mem;
    }
    m.set(`${i.metadata.namespace}/${i.metadata.name}`, { cpu, mem });
  }
  return m;
}
