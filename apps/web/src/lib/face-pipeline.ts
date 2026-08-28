import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import * as ort from 'onnxruntime-web'

import { FACE_DIM } from '@/lib/api'

const WASM_VISION =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
const LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const SFACE_MODEL = '/models/face_recognition_sface_2021dec.onnx'
const ORT_WASM = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/'

const DST: Array<[number, number]> = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
]

type Point = { x: number; y: number }

let landmarker: FaceLandmarker | null = null
let session: ort.InferenceSession | null = null
let lastTs = 0

export type FaceQuality = {
  ok: boolean
  reason: string
  score: number
  width: number
}

export async function initFacePipeline() {
  if (!landmarker) {
    const fileset = await FilesetResolver.forVisionTasks(WASM_VISION)
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: LANDMARKER_MODEL,
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
    })
  }
  if (!session) {
    ort.env.wasm.wasmPaths = ORT_WASM
    session = await ort.InferenceSession.create(SFACE_MODEL, {
      executionProviders: ['wasm'],
    })
  }
}

export function detectFace(video: HTMLVideoElement): {
  landmarks: NormalizedLandmark[]
  quality: FaceQuality
} | null {
  if (!landmarker) return null
  const now = performance.now()
  if (now <= lastTs) {
    lastTs = now + 1
  } else {
    lastTs = now
  }
  const result = landmarker.detectForVideo(video, lastTs)
  const lm = result.faceLandmarks[0]
  if (!lm) {
    return {
      landmarks: [],
      quality: { ok: false, reason: 'Tidak ada wajah', score: 0, width: 0 },
    }
  }
  const quality = assessQuality(lm, video.videoWidth, video.videoHeight)
  return { landmarks: lm, quality }
}

export async function embedFace(
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[]
): Promise<number[]> {
  if (!session) throw new Error('pipeline not initialized')
  const src = fivePoints(landmarks, video.videoWidth, video.videoHeight)
  const aligned = warpAligned(video, src, 112)
  const input = imageDataToNCHW(aligned)
  const feeds: Record<string, ort.Tensor> = {}
  feeds[session.inputNames[0]] = new ort.Tensor('float32', input, [1, 3, 112, 112])
  const out = await session.run(feeds)
  const tensor = out[session.outputNames[0]]
  const raw = Array.from(tensor.data as Float32Array)
  if (raw.length !== FACE_DIM) {
    throw new Error(`unexpected embedding length ${raw.length}`)
  }
  return l2normalize(raw)
}

function fivePoints(lm: NormalizedLandmark[], w: number, h: number): Point[] {
  const eyeA = toPx(lm[33] ?? lm[133], w, h)
  const eyeB = toPx(lm[263] ?? lm[362], w, h)
  const mouthA = toPx(lm[61], w, h)
  const mouthB = toPx(lm[291], w, h)
  const nose = toPx(lm[1], w, h)
  const eyes = [eyeA, eyeB].sort((p, q) => p.x - q.x)
  const mouth = [mouthA, mouthB].sort((p, q) => p.x - q.x)
  return [eyes[0], eyes[1], nose, mouth[0], mouth[1]]
}

function toPx(p: NormalizedLandmark | undefined, w: number, h: number): Point {
  if (!p) return { x: w / 2, y: h / 2 }
  return { x: p.x * w, y: p.y * h }
}

function assessQuality(lm: NormalizedLandmark[], w: number, h: number): FaceQuality {
  const xs = lm.map((p) => p.x * w)
  const ys = lm.map((p) => p.y * h)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX
  const height = maxY - minY
  const eyes = fivePoints(lm, w, h)
  const eyeDx = eyes[1].x - eyes[0].x
  const eyeDy = eyes[1].y - eyes[0].y
  const tilt = Math.abs(Math.atan2(eyeDy, eyeDx))
  if (width < 90 || height < 90) {
    return { ok: false, reason: 'Wajah terlalu kecil / jauh', score: width / 160, width }
  }
  if (tilt > 0.35) {
    return { ok: false, reason: 'Hadap kamera lebih lurus', score: 1 - tilt, width }
  }
  return { ok: true, reason: 'Siap', score: Math.min(1, width / 180), width }
}

function estimateSimilarity(src: Point[], dst: Array<[number, number]>) {
  const n = src.length
  let srcMx = 0
  let srcMy = 0
  let dstMx = 0
  let dstMy = 0
  for (let i = 0; i < n; i++) {
    srcMx += src[i].x
    srcMy += src[i].y
    dstMx += dst[i][0]
    dstMy += dst[i][1]
  }
  srcMx /= n
  srcMy /= n
  dstMx /= n
  dstMy /= n
  let varS = 0
  let cov00 = 0
  let cov01 = 0
  let cov10 = 0
  let cov11 = 0
  for (let i = 0; i < n; i++) {
    const sx = src[i].x - srcMx
    const sy = src[i].y - srcMy
    const dx = dst[i][0] - dstMx
    const dy = dst[i][1] - dstMy
    varS += sx * sx + sy * sy
    cov00 += sx * dx
    cov01 += sx * dy
    cov10 += sy * dx
    cov11 += sy * dy
  }
  const a = cov00 + cov11
  const b = cov01 - cov10
  const norm = Math.hypot(a, b) || 1
  const cos = a / norm
  const sin = b / norm
  const s = varS > 1e-8 ? norm / varS : 1
  const ra = s * cos
  const rb = s * sin
  const tx = dstMx - (ra * srcMx - rb * srcMy)
  const ty = dstMy - (rb * srcMx + ra * srcMy)
  return { a: ra, b: rb, tx, ty }
}

function warpAligned(video: HTMLVideoElement, src: Point[], size: number): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas 2d unavailable')
  ctx.drawImage(video, 0, 0)
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const t = estimateSimilarity(src, DST)
  const det = t.a * t.a + t.b * t.b || 1
  const out = new ImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - t.tx
      const dy = y - t.ty
      const xs = (t.a * dx + t.b * dy) / det
      const ys = (-t.b * dx + t.a * dy) / det
      const px = sampleBilinear(frame, xs, ys)
      const o = (y * size + x) * 4
      out.data[o] = px[0]
      out.data[o + 1] = px[1]
      out.data[o + 2] = px[2]
      out.data[o + 3] = 255
    }
  }
  return out
}

function sampleBilinear(img: ImageData, x: number, y: number): [number, number, number] {
  const w = img.width
  const h = img.height
  if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return [0, 0, 0]
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = x0 + 1
  const y1 = y0 + 1
  const ax = x - x0
  const ay = y - y0
  const p = (ix: number, iy: number, c: number) => img.data[(iy * w + ix) * 4 + c]
  const mix = (a: number, b: number, t: number) => a + (b - a) * t
  const r = mix(mix(p(x0, y0, 0), p(x1, y0, 0), ax), mix(p(x0, y1, 0), p(x1, y1, 0), ax), ay)
  const g = mix(mix(p(x0, y0, 1), p(x1, y0, 1), ax), mix(p(x0, y1, 1), p(x1, y1, 1), ax), ay)
  const b = mix(mix(p(x0, y0, 2), p(x1, y0, 2), ax), mix(p(x0, y1, 2), p(x1, y1, 2), ax), ay)
  return [r, g, b]
}

function imageDataToNCHW(img: ImageData): Float32Array {
  const out = new Float32Array(3 * 112 * 112)
  const plane = 112 * 112
  for (let i = 0; i < plane; i++) {
    const o = i * 4
    out[i] = img.data[o]
    out[plane + i] = img.data[o + 1]
    out[2 * plane + i] = img.data[o + 2]
  }
  return out
}

function l2normalize(v: number[]): number[] {
  let sum = 0
  for (const x of v) sum += x * x
  const n = Math.sqrt(sum) || 1
  return v.map((x) => x / n)
}
