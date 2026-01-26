import { useEffect, useState } from 'react'

const API_HEALTH_URL = 'http://127.0.0.1:11222/health'

export function StartupLoading({ children }: { children: React.ReactNode }): React.ReactElement {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string>('')

  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    let retryCount = 0
    const maxRetries = 100
    let delay = 100

    const checkApi = async (): Promise<void> => {
      try {
        const response = await fetch(API_HEALTH_URL)
        if (response.ok) {
          setIsReady(true)
          return
        }
      } catch (e) {
        // Fetch failed, likely connection refused
      }

      // Check process status via IPC even if fetch fails
      const status = await window.api.server.getStatus()
      if (status.startsWith('exited')) {
        const apiLogs = await window.api.server.getLogs()
        setError(`Background service failed to start (${status})`)
        setLogs(apiLogs)
        return
      }

      if (retryCount >= maxRetries) {
        const apiLogs = await window.api.server.getLogs()
        setError('Connection timeout: Background service is taking too long to respond.')
        setLogs(apiLogs)
        return
      }

      retryCount++
      delay = Math.min(delay * 1.5, 1000)
      timeoutId = setTimeout(checkApi, delay)
    }

    checkApi()

    return (): void => clearTimeout(timeoutId)
  }, [])

  if (isReady) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#09090b] text-white p-8 overflow-auto">
      <div className="flex flex-col items-center gap-6 max-w-2xl w-full">
        {error ? (
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="text-red-500 font-bold text-lg">{error}</div>
            <div className="w-full bg-black/50 p-4 rounded border border-white/10 font-mono text-xs text-white/70 whitespace-pre-wrap max-h-[60vh] overflow-auto">
              {logs || 'No logs available.'}
            </div>
            <p className="text-white/40 text-xs">
              Check the console for more details.
            </p>
          </div>
        ) : (
          <>
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            <div className="flex flex-col items-center gap-2">
              <p className="font-medium text-lg">Initialising Rayna</p>
              <p className="text-white/40 text-sm animate-pulse">
                Connecting to background service...
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

