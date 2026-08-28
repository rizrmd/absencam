import { useEffect } from 'react'
import { Camera, RefreshCw, Server, Database } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useApiStatus } from '@/stores/api-status'

function statusVariant(ok: boolean) {
  return ok ? 'default' : 'destructive'
}

function App() {
  const { status, health, ready, info, error, refresh } = useApiStatus()

  useEffect(() => {
    void refresh()
  }, [refresh])

  const apiUp = status === 'ok'
  const dbUp = ready?.database === 'up'

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-16">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Camera className="size-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Monorepo scaffold</p>
            <h1 className="font-heading text-2xl font-medium tracking-tight">
              Absencam
            </h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>API status</CardTitle>
            <CardDescription>
              Vite proxies <code className="text-foreground">/api</code> to the
              Go server on :8080. Start Postgres and the API, then refresh.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Server className="size-4 text-muted-foreground" />
                Process
              </div>
              <Badge variant={statusVariant(apiUp)}>
                {status === 'loading' ? 'checking' : apiUp ? 'ok' : 'down'}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Database className="size-4 text-muted-foreground" />
                PostgreSQL
              </div>
              <Badge variant={statusVariant(dbUp)}>
                {ready?.database ?? 'unknown'}
              </Badge>
            </div>
            {info ? (
              <p className="text-sm text-muted-foreground">
                {info.app} {info.version} · {info.env}
                {health?.status ? ` · health ${health.status}` : ''}
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              onClick={() => void refresh()}
              disabled={status === 'loading'}
            >
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}

export default App
