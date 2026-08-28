import { create } from 'zustand'

export type HealthPayload = {
  status: string
  app: string
  env: string
}

export type ReadyPayload = {
  status: string
  app: string
  database: string
  error?: string
}

export type InfoPayload = {
  app: string
  version: string
  env: string
}

type LoadStatus = 'idle' | 'loading' | 'ok' | 'error'

type ApiStatusState = {
  status: LoadStatus
  health: HealthPayload | null
  ready: ReadyPayload | null
  info: InfoPayload | null
  error: string | null
  refresh: () => Promise<void>
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''

async function getJSON<T>(path: string): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(`${apiBase}${path}`)
  const data = (await res.json()) as T
  return { ok: res.ok, data }
}

export const useApiStatus = create<ApiStatusState>((set) => ({
  status: 'idle',
  health: null,
  ready: null,
  info: null,
  error: null,
  refresh: async () => {
    set({ status: 'loading', error: null })
    try {
      const [health, ready, info] = await Promise.all([
        getJSON<HealthPayload>('/api/health'),
        getJSON<ReadyPayload>('/api/ready'),
        getJSON<InfoPayload>('/api/v1/info'),
      ])
      set({
        status: health.ok ? 'ok' : 'error',
        health: health.data,
        ready: ready.data,
        info: info.data,
        error: health.ok ? null : `health endpoint returned an error`,
      })
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : 'request failed',
      })
    }
  },
}))
