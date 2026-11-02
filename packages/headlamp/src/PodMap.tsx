import { K8s, Router } from '@kinvolk/headlamp-plugin/lib';
import { request } from '@kinvolk/headlamp-plugin/lib/ApiProxy';
import {
  DARK,
  LIGHT,
  type ColorMode,
  emptyUsage,
  parseNodeMetrics,
  parsePodMetrics,
  type Usage,
  compileQuery,
  computeLayout,
  draw,
  groupLabelKeys,
  hitNode,
  hitPod,
  nodeTip,
  podTip,
  type View,
  type NodeInfo,
  type SizeMode,
  toNode,
  toPod,
} from '@kubefast/core';
import { MenuItem, Select, TextField, Typography, useTheme } from '@mui/material';
import React from 'react';
import { useHistory } from 'react-router-dom';

const M = '/apis/metrics.k8s.io/v1beta1';
const POLL_MS = 15000;

function useUsage(): { usage: Usage; error: string } {
  const [usage, setUsage] = React.useState<Usage>(emptyUsage());
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const nodes = parseNodeMetrics(await request(`${M}/nodes`));
        const pods = parsePodMetrics(await request(`${M}/pods`));
        if (!stop) { setUsage({ nodes, pods }); setError(''); }
      } catch (e) {
        if (!stop) setError('metrics-server not available');
      }
      if (!stop) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { stop = true; clearTimeout(timer); };
  }, []);
  return { usage, error };
}

export default function PodMap() {
  const [podItems, podErr] = K8s.ResourceClasses.Pod.useList();
  const [nodeItems, nodeErr] = K8s.ResourceClasses.Node.useList();

  const [query, setQuery] = React.useState('');
  const [groupBy, setGroupBy] = React.useState('');
  const [size, setSize] = React.useState<SizeMode>('fixed');
  const [view, setView] = React.useState<View>('requests');
  const [color, setColor] = React.useState<ColorMode>('status');
  const [dims, setDims] = React.useState({ w: 800, h: 600 });
  const [scrollY, setScrollY] = React.useState(0);
  const [tip, setTip] = React.useState<{ x: number; y: number; text: string } | null>(null);

  const history = useHistory();
  const dark = useTheme().palette.mode === 'dark';
  const theme = dark ? DARK : LIGHT;
  const { usage, error: usageErr } = useUsage();
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const nodes = React.useMemo(() => {
    const m = new Map<string, NodeInfo>();
    for (const n of nodeItems ?? []) {
      const ni = toNode(n.jsonData);
      m.set(ni.name, ni);
    }
    return m;
  }, [nodeItems]);
  const pods = React.useMemo(() => (podItems ?? []).map(p => toPod(p.jsonData)), [podItems]);
  const groupKeys = React.useMemo(() => groupLabelKeys(nodes.values()), [nodes]);
  const layout = React.useMemo(
    () => computeLayout(nodes, pods, { width: dims.w, groupBy, size, view, usage }),
    [nodes, pods, dims.w, groupBy, size, view, usage]
  );
  const match = React.useMemo(() => compileQuery(query), [query]);
  const matched = React.useMemo(
    () => (match ? pods.filter(match).length : pods.length),
    [match, pods]
  );

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxScroll = Math.max(0, layout.height - dims.h);
  const sy = Math.min(scrollY, maxScroll);

  React.useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(dims.w * dpr);
    c.height = Math.floor(dims.h * dpr);
    draw(ctx, { layout, scrollY: sy, w: dims.w, h: dims.h, dpr, color, view, theme, match });
  }, [layout, sy, dims, color, view, theme, match]);

  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScrollY(v => Math.max(0, Math.min(v + e.deltaY, maxScroll)));
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [maxScroll]);

  const targetUrl = (e: React.MouseEvent<HTMLCanvasElement>): string | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top + sy;
    const i = hitPod(layout, x, y);
    if (i >= 0) {
      const p = layout.pods[i];
      return Router.createRouteURL('pod', { namespace: p.ns, name: p.name });
    }
    const b = hitNode(layout, x, y);
    return b?.node ? Router.createRouteURL('node', { name: b.node.name }) : null;
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const url = targetUrl(e);
    if (url) history.push(url);
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.currentTarget.style.cursor = targetUrl(e) ? 'pointer' : 'default';
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top + sy;
    let text = '';
    const i = hitPod(layout, x, y);
    if (i >= 0) text = podTip(layout, i);
    else {
      const b = hitNode(layout, x, y);
      if (b?.node) text = nodeTip(b);
    }
    setTip(text ? { x: e.clientX + 14, y: e.clientY + 14, text } : null);
  };

  const err = podErr || nodeErr;
  const loading = podItems === null || nodeItems === null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0' }}>
        <TextField
          size="small"
          style={{ width: 320 }}
          placeholder="search pods: name, ns:foo, node:x, status:crash, is:noreq, is:nolimit"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <Select
          size="small"
          displayEmpty
          value={groupBy}
          onChange={e => setGroupBy(e.target.value as string)}
          renderValue={v => `group: ${v || '(none)'}`}
        >
          <MenuItem value="">(none)</MenuItem>
          {groupKeys.map(k => (
            <MenuItem key={k} value={k}>
              {k}
            </MenuItem>
          ))}
        </Select>
        <Select size="small" value={view} onChange={e => setView(e.target.value as View)}>
          <MenuItem value="requests">view: requests</MenuItem>
          <MenuItem value="limits">view: limits</MenuItem>
        </Select>
        <Select size="small" value={size} onChange={e => setSize(e.target.value as SizeMode)}>
          <MenuItem value="fixed">size: equal</MenuItem>
          <MenuItem value="mem">size: memory {view === 'limits' ? 'limit' : 'req'}</MenuItem>
          <MenuItem value="cpu">size: cpu {view === 'limits' ? 'limit' : 'req'}</MenuItem>
        </Select>
        <Select size="small" value={color} onChange={e => setColor(e.target.value as ColorMode)}>
          <MenuItem value="status">color: status</MenuItem>
          <MenuItem value="ns">color: namespace</MenuItem>
        </Select>
        <Typography variant="body2" style={{ marginLeft: 'auto' }}>
          {err
            ? `error: ${String((err as Error).message ?? err)}`
            : loading
            ? 'loading…'
            : `${nodes.size} nodes · ${pods.length} pods${query ? ` · ${matched} match` : ''}${
                usageErr ? ` · ${usageErr}` : ''
              }`}
        </Typography>
      </div>
      <div ref={wrapRef} style={{ flex: 1, background: dark ? '#0f1419' : '#ffffff', border: dark ? 'none' : '1px solid #d1d9e0', borderRadius: 4, overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ width: dims.w, height: dims.h, display: 'block' }}
          onMouseMove={onMove}
          onClick={onClick}
          onMouseLeave={() => setTip(null)}
        />
      </div>
      {tip && (
        <div
          style={{
            position: 'fixed',
            left: tip.x,
            top: tip.y,
            pointerEvents: 'none',
            background: dark ? '#1d252d' : '#ffffff',
            color: dark ? '#d6dbe0' : '#1f2328',
            border: `1px solid ${dark ? '#36434f' : '#d1d9e0'}`,
            boxShadow: dark ? 'none' : '0 2px 8px rgba(0,0,0,.15)',
            borderRadius: 4,
            padding: '6px 8px',
            whiteSpace: 'pre',
            font: '12px ui-monospace, monospace',
            zIndex: 2000,
          }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
