export type StatusClass = 'ok' | 'notready' | 'pending' | 'done' | 'error' | 'terminating';

export interface NodeInfo {
  name: string;
  labels: Record<string, string>;
  ready: boolean;
  unschedulable: boolean;
  cpuAlloc: number; // millicores
  memAlloc: number; // bytes
  podsAlloc: number;
}

export interface PodInfo {
  uid: string;
  name: string;
  ns: string;
  node: string; // '' when unscheduled
  status: string;
  cls: StatusClass;
  ready: string;
  restarts: number;
  cpuReq: number; // millicores
  memReq: number; // bytes
  cpuLim: number; // 0 = no limit
  memLim: number
  holds: boolean; // false for Succeeded/Failed pods: they no longer occupy node resources
  owner: string;
  hay: string; // lowercase search haystack
}
