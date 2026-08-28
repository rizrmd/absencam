import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, ScanLine, UserPlus, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  enrollFace,
  listPeople,
  scanFace,
  type Person,
  type ScanResponse,
} from '@/lib/api'
import {
  detectFace,
  embedFace,
  initFacePipeline,
  type FaceQuality,
} from '@/lib/face-pipeline'
import { useApiStatus } from '@/stores/api-status'

type Mode = 'enroll' | 'scan'

const captureGuides = [
  { title: 'Lurus', instruction: 'Hadapkan wajah lurus dan sejajar dengan kamera.' },
  { title: 'Kiri', instruction: 'Tolehkan wajah sekitar 20° ke kiri Anda.' },
  { title: 'Kanan', instruction: 'Tolehkan wajah sekitar 20° ke kanan Anda.' },
  { title: 'Atas', instruction: 'Angkat dagu sedikit, sekitar 10°, mata tetap ke kamera.' },
  { title: 'Bawah', instruction: 'Turunkan dagu sedikit, sekitar 10°, mata tetap ke kamera.' },
] as const

export function CameraApp() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const scanBusy = useRef(false)
  const lastScanAt = useRef(0)
  const modeRef = useRef<Mode>('enroll')

  const { status, ready, refresh } = useApiStatus()
  const [mode, setMode] = useState<Mode>('enroll')

  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  const [readyPipeline, setReadyPipeline] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [quality, setQuality] = useState<FaceQuality | null>(null)
  const [code, setCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [samples, setSamples] = useState<number[][]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null)
  const [busy, setBusy] = useState(false)

  const loadPeople = useCallback(async () => {
    try {
      const res = await listPeople()
      setPeople(res.people)
    } catch {
      /* API may still be starting */
    }
  }, [])

  useEffect(() => {
    void refresh()
    void loadPeople()
  }, [refresh, loadPeople])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await initFacePipeline()
        if (!cancelled) setReadyPipeline(true)
      } catch (err) {
        if (!cancelled) {
          setCamError(err instanceof Error ? err.message : 'gagal memuat model wajah')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(async () => {
    setCamError(null)
    stopCamera()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      const tick = () => {
        if (video.readyState >= 2) {
          const det = detectFace(video)
          if (det) setQuality(det.quality)
          if (
            modeRef.current === 'scan' &&
            det?.quality.ok &&
            det.landmarks.length &&
            !scanBusy.current &&
            performance.now() - lastScanAt.current > 700
          ) {
            scanBusy.current = true
            lastScanAt.current = performance.now()
            void (async () => {
              try {
                const embedding = await embedFace(video, det.landmarks)
                const res = await scanFace(embedding)
                setScanResult(res)
                setMessage(
                  res.matched && res.person
                    ? `Hadir: ${res.person.full_name} (${(res.similarity * 100).toFixed(1)}%)`
                    : `Tidak kenal (${(res.similarity * 100).toFixed(1)}%)`
                )
              } catch (err) {
                setMessage(err instanceof Error ? err.message : 'scan gagal')
              } finally {
                scanBusy.current = false
              }
            })()
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      setCamError(err instanceof Error ? err.message : 'kamera ditolak')
    }
  }, [stopCamera])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  async function captureSample() {
    if (samples.length >= captureGuides.length) return
    const video = videoRef.current
    if (!video) return
    const det = detectFace(video)
    if (!det?.quality.ok || !det.landmarks.length) {
      setMessage(det?.quality.reason ?? 'Wajah belum siap')
      return
    }
    setBusy(true)
    try {
      const embedding = await embedFace(video, det.landmarks)
      setSamples((prev) => [...prev, embedding].slice(0, captureGuides.length))
      const captured = samples.length + 1
      setMessage(
        captured === captureGuides.length
          ? 'Semua sampel tersimpan. Data siap didaftarkan.'
          : `Sampel ${captured} tersimpan. Ikuti panduan berikutnya.`
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'gagal embed')
    } finally {
      setBusy(false)
    }
  }

  async function submitEnroll() {
    if (!code.trim() || !fullName.trim()) {
      setMessage('Isi kode dan nama')
      return
    }
    if (samples.length < captureGuides.length) {
      setMessage(`Lengkapi semua ${captureGuides.length} sampel wajah`)
      return
    }
    setBusy(true)
    try {
      const out = await enrollFace({
        code: code.trim(),
        full_name: fullName.trim(),
        embeddings: samples,
      })
      setMessage(`Terdaftar ${out.person.full_name} · ${out.stored} embedding`)
      setSamples([])
      await loadPeople()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'enroll gagal')
    } finally {
      setBusy(false)
    }
  }

  const dbUp = ready?.database === 'up'
  const apiUp = status === 'ok'

  return (
    <main className="min-h-svh bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Camera className="size-5" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-medium tracking-tight">Absencam</h1>
              <p className="text-sm text-muted-foreground">
                Daftar wajah di browser, simpan vektor di PostgreSQL (CPU only)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={apiUp ? 'default' : 'destructive'}>API {apiUp ? 'ok' : 'down'}</Badge>
            <Badge variant={dbUp ? 'default' : 'destructive'}>
              Postgres {ready?.database ?? 'unknown'}
            </Badge>
            <Badge variant={readyPipeline ? 'default' : 'secondary'}>
              {readyPipeline ? 'model siap' : 'memuat model'}
            </Badge>
          </div>
        </header>

        <div className="flex gap-2">
          <Button
            variant={mode === 'enroll' ? 'default' : 'outline'}
            onClick={() => {
              setMode('enroll')
              setScanResult(null)
            }}
          >
            <UserPlus data-icon="inline-start" />
            Daftar
          </Button>
          <Button
            variant={mode === 'scan' ? 'default' : 'outline'}
            onClick={() => setMode('scan')}
          >
            <ScanLine data-icon="inline-start" />
            Scan absen
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>{mode === 'enroll' ? 'Registrasi wajah' : 'Scan kamera'}</CardTitle>
              <CardDescription>
                Deteksi MediaPipe + embedding SFace 128-d di perangkat. Server hanya
                menyimpan/mencari vektor (pgvector HNSW).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-xl bg-muted">
                <video
                  ref={videoRef}
                  className="aspect-video w-full -scale-x-100 bg-black object-cover"
                  playsInline
                  muted
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void startCamera()} disabled={!readyPipeline}>
                  <Camera data-icon="inline-start" />
                  Hidupkan kamera
                </Button>
                {mode === 'enroll' ? (
                  <Button
                    variant="outline"
                    onClick={() => void captureSample()}
                    disabled={busy || samples.length >= captureGuides.length}
                  >
                    {samples.length >= captureGuides.length
                      ? 'Sampel lengkap'
                      : `Ambil gambar ${samples.length + 1}/${captureGuides.length}`}
                  </Button>
                ) : null}
                <span className="text-sm text-muted-foreground">
                  {quality ? `${quality.reason}${quality.ok ? '' : ''}` : 'Menunggu kamera'}
                </span>
              </div>
              {camError ? <p className="text-sm text-destructive">{camError}</p> : null}
              {message ? <p className="text-sm">{message}</p> : null}

              {mode === 'enroll' ? (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-border bg-muted/40 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Panduan pengambilan wajah
                        </p>
                        <p className="mt-1 font-medium">
                          {samples.length < captureGuides.length
                            ? captureGuides[samples.length].title
                            : 'Semua pose selesai'}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {samples.length < captureGuides.length
                            ? captureGuides[samples.length].instruction
                            : 'Kelima variasi wajah sudah direkam.'}
                        </p>
                      </div>
                      <Badge variant={samples.length === captureGuides.length ? 'default' : 'secondary'}>
                        {samples.length}/{captureGuides.length}
                      </Badge>
                    </div>
                    <ol className="grid grid-cols-5 gap-2" aria-label="Progres pengambilan wajah">
                      {captureGuides.map((guide, index) => {
                        const complete = index < samples.length
                        const active = index === samples.length
                        return (
                          <li
                            key={guide.title}
                            className={`flex min-w-0 flex-col items-center gap-1 rounded-md border px-1 py-2 text-center text-xs ${
                              active ? 'border-primary bg-background' : 'border-transparent'
                            }`}
                            aria-current={active ? 'step' : undefined}
                          >
                            <span
                              className={`flex size-6 items-center justify-center rounded-full ${
                                complete
                                  ? 'bg-primary text-primary-foreground'
                                  : active
                                    ? 'border border-primary text-primary'
                                    : 'border border-border text-muted-foreground'
                              }`}
                            >
                              {complete ? <Check className="size-3.5" /> : index + 1}
                            </span>
                            <span className="hidden truncate text-muted-foreground sm:block">
                              {guide.title}
                            </span>
                          </li>
                        )
                      })}
                    </ol>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="code">Kode / NIP</Label>
                      <Input
                        id="code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="EMP-001"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="name">Nama</Label>
                      <Input
                        id="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Nama lengkap"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button
                        onClick={() => void submitEnroll()}
                        disabled={busy || samples.length < captureGuides.length}
                      >
                        Simpan ke database
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border p-3 text-sm">
                  {scanResult?.matched && scanResult.person ? (
                    <p>
                      <span className="font-medium">{scanResult.person.full_name}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {scanResult.person.code} · cosine{' '}
                        {(scanResult.similarity * 100).toFixed(1)}%
                      </span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      Arahkan wajah ke kamera. Scan otomatis saat wajah stabil.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" />
                Orang terdaftar
              </CardTitle>
              <CardDescription>Disimpan sebagai embedding, bukan foto.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {people.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada data.</p>
              ) : (
                people.map((p) => (
                  <div key={p.id}>
                    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
                      <span className="font-medium">{p.full_name}</span>
                      <span className="text-muted-foreground">{p.code}</span>
                    </div>
                    <Separator />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
