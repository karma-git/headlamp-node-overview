import { toNode, toPod } from '@kubefast/core';
import { listWatch } from './watch';
import type { NodeInfo, PodInfo } from '@kubefast/core';

export type Conn = 'syncing' | 'live' | 'error';

export class ClusterState {
  nodes = new Map<string, NodeInfo>();
  pods = new Map<string, PodInfo>();
  version = 0;
  conn: Record<'nodes' | 'pods', Conn> = { nodes: 'syncing', pods: 'syncing' };
  error = '';
  private ac = new AbortController();

  constructor(private onChange: () => void, private base = '') {}

  start() {
    const mk = <T>(kind: 'nodes' | 'pods', map: Map<string, T>, conv: (o: any) => T, key: (o: any) => string) => ({
      replace: (items: any[]) => { map.clear(); for (const o of items) map.set(key(o), conv(o)); this.bump(); },
      apply: (type: string, o: any) => { if (type === 'DELETED') map.delete(key(o)); else map.set(key(o), conv(o)); this.bump(); },
      status: (s: Conn, msg?: string) => { this.conn[kind] = s; this.error = s === 'error' ? msg ?? '' : ''; this.bump(); },
    });
    void listWatch(this.base, '/api/v1/nodes', mk('nodes', this.nodes, toNode, (o) => o.metadata.name), this.ac.signal);
    void listWatch(this.base, '/api/v1/pods', mk('pods', this.pods, toPod, (o) => o.metadata.uid), this.ac.signal);
  }

  stop() { this.ac.abort(); }
  private bump() { this.version++; this.onChange(); }
}
