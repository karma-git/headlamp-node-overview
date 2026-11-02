import type { PodInfo } from './types';

export type PodMatcher = (p: PodInfo) => boolean;

// also: is:noreq (no cpu/mem requests), is:nolimit (no cpu/mem limits)
// tokens: "foo" (substring in ns/name node status owner), "ns:x", "node:x", "status:x", "owner:x"; space = AND
export function compileQuery(q: string): PodMatcher | null {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  const tests = toks.map((t): PodMatcher => {
    if (t === 'is:noreq') return (p) => p.cpuReq === 0 || p.memReq === 0;
    if (t === 'is:nolimit') return (p) => p.cpuLim === 0 || p.memLim === 0;
    const m = /^(ns|node|status|owner):(.*)$/.exec(t);
    if (!m) return (p) => p.hay.includes(t);
    const v = m[2];
    switch (m[1]) {
      case 'ns': return (p) => p.ns.toLowerCase().includes(v);
      case 'node': return (p) => p.node.toLowerCase().includes(v);
      case 'status': return (p) => p.status.toLowerCase().includes(v);
      default: return (p) => p.owner.toLowerCase().includes(v);
    }
  });
  return (p) => tests.every((f) => f(p));
}
