const BASE = '/api';

export interface Device {
  device: string;
  last_heard_ts: number;
  last_uid: number;
}

export interface Frame {
  can_id: number;
  extended: boolean;
  rtr: boolean;
  error: boolean;
  data_hex: string;
}

export interface Record {
  hw_ts_us: number;
  boot_id: number;
  seqno: number;
  commit_ts: number;
  frame: Frame;
}

export interface Boot {
  boot_id: number;
  first_record: Record;
  last_record: Record;
}

export interface DevicesResponse {
  devices: Device[];
}

export interface BootsResponse {
  device: string;
  boots: Boot[];
}

export interface RecordsResponse {
  device: string;
  records: Record[];
  latest_seqno_seen: number;
}

export const api = {
  getDevices: async (): Promise<DevicesResponse> => {
    const res = await fetch(`${BASE}/devices`);
    return res.json();
  },

  getBoots: async (device: string, earliest?: string, latest?: string): Promise<BootsResponse> => {
    const params = new URLSearchParams({ device });
    if (earliest) params.set('earliest_commit', earliest);
    if (latest) params.set('latest_commit', latest);
    const res = await fetch(`${BASE}/boots?${params}`);
    return res.json();
  },

  getRecords: async (
    device: string,
    bootIds: number[],
    opts?: { seqnoMin?: number; seqnoMax?: number; limit?: number; waitTimeout?: number }
  ): Promise<RecordsResponse> => {
    const params = new URLSearchParams({ device });
    bootIds.forEach(id => params.append('boot_id', String(id)));
    if (opts?.seqnoMin) params.set('seqno_min', String(opts.seqnoMin));
    if (opts?.seqnoMax) params.set('seqno_max', String(opts.seqnoMax));
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.waitTimeout) params.set('wait_timeout_s', String(opts.waitTimeout));
    const res = await fetch(`${BASE}/records?${params}`);
    return res.json();
  }
};
