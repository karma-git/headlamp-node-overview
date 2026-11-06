import { emptyUsage, parseNodeMetrics, parsePodMetrics } from '@node-overview/core';

const INTERVAL = 15000;
const M = '/apis/metrics.k8s.io/v1beta1';

export class MetricsPoller {
  usage = emptyUsage();
  version = 0;
  error = '';
  private ac = new AbortController();

  constructor(private onChange: () => void, private base = '') {}

  start() { void this.loop(); }
  stop() { this.ac.abort(); }

  private async get(path: string) {
    const res = await fetch(this.base + path, { signal: this.ac.signal });
    if (!res.ok) throw new Error(res.status === 404 ? 'metrics-server not available' : `metrics ${res.status}`);
    return res.json();
  }

  private async loop() {
    while (!this.ac.signal.aborted) {
      try {
        this.usage.nodes = parseNodeMetrics(await this.get(`${M}/nodes`));
        this.usage.pods = parsePodMetrics(await this.get(`${M}/pods`));
        this.error = '';
      } catch (e: any) {
        if (this.ac.signal.aborted) return;
        this.error = String(e?.message ?? e);
      }
      this.version++;
      this.onChange();
      await new Promise<void>((res) => setTimeout(res, INTERVAL));
    }
  }
}
