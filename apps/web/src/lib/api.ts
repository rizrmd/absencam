const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''

export const FACE_MODEL_ID = 'sface-2021dec'
export const FACE_DIM = 128

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `${path} failed (${res.status})`)
  }
  return data
}

export type Person = {
  id: string
  code: string
  full_name: string
  created_at: string
}

export type EnrollResponse = {
  person: Person
  stored: number
  model_id: string
  dimension: number
}

export type ScanHit = {
  person_id: string
  code: string
  full_name: string
  similarity: number
}

export type ScanResponse = {
  matched: boolean
  person?: ScanHit
  similarity: number
  threshold: number
  candidates: ScanHit[]
  event_id?: string
}

export function listPeople() {
  return request<{ people: Person[] }>('/api/v1/people')
}

export function enrollFace(input: {
  code: string
  full_name: string
  embeddings: number[][]
  model_id?: string
}) {
  return request<EnrollResponse>('/api/v1/faces/enroll', {
    method: 'POST',
    body: JSON.stringify({ ...input, model_id: input.model_id ?? FACE_MODEL_ID }),
  })
}

export function scanFace(embedding: number[], modelId = FACE_MODEL_ID) {
  return request<ScanResponse>('/api/v1/faces/scan', {
    method: 'POST',
    body: JSON.stringify({ embedding, model_id: modelId }),
  })
}
