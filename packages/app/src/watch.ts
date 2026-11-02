/* eslint-disable @typescript-eslint/no-explicit-any */
export interface WatchHandlers {
  replace(items: any[]): void;
  apply(type: 'ADDED' | 'MODIFIED' | 'DELETED', obj: any): void;
  status(s: 'syncing' | 'live' | 'error', msg?: string): void;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res) => {
    const t = setTimeout(res, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
  });

// list + watch over a kubectl-proxy-compatible base ('' = same origin).
export async function listWatch(base: string, path: string, h: WatchHandlers, signal: AbortSignal) {
  let backoff = 500;
  while (!signal.aborted) {
    try {
      h.status('syncing');
      const res = await fetch(base + path, { signal });
      if (!res.ok) {
        const hint = res.status >= 500 ? ' (is `kubectl proxy --port=8001` running?)' : '';
        throw new Error(`list ${path}: ${res.status} ${res.statusText}${hint}`);
      }
      const list = await res.json();
      h.replace(list.items ?? []);
      let rv: string = list.metadata.resourceVersion;
      h.status('live');
      backoff = 500;

      while (!signal.aborted) {
        const url = `${base}${path}?watch=1&allowWatchBookmarks=true&timeoutSeconds=300&resourceVersion=${rv}`;
        const w = await fetch(url, { signal });
        if (!w.ok || !w.body) throw new Error(`watch ${path}: ${w.status}`);
        const reader = w.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        let gone = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (!line) continue;
            const ev = JSON.parse(line);
            if (ev.type === 'ERROR') {
              if (ev.object?.code === 410) gone = true;
              else throw new Error(ev.object?.message ?? 'watch error');
            } else if (ev.type === 'BOOKMARK') {
              rv = ev.object.metadata.resourceVersion;
            } else {
              rv = ev.object.metadata.resourceVersion;
              h.apply(ev.type, ev.object);
            }
          }
          if (gone) break;
        }
        if (gone) break; // relist
      }
    } catch (e: any) {
      if (signal.aborted) return;
      h.status('error', String(e?.message ?? e));
      await sleep(backoff, signal);
      backoff = Math.min(backoff * 2, 10000);
    }
  }
}
