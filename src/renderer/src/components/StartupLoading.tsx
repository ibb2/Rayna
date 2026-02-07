import { useEffect, useState } from "react";
import { Spinner } from "./ui/spinner";

const API_HEALTH_URL = "http://127.0.0.1:34567/health";

export function StartupLoading({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>("");
  // const [retryCount, setRetryCount] = useState(0)
  // const [lastCheck, setLastCheck] = useState<string>('')

  const checkApi = async (count = 0, delay = 100): Promise<void> => {
    // setRetryCount(count)
    // setLastCheck(new Date().toLocaleTimeString())

    try {
      const response = await fetch(API_HEALTH_URL);
      if (response.ok) {
        const accessToken = await window.api.auth.getUserAccessToken();
        const server = await window.api.auth.getUserSelectedServer();
        const libraries = await window.api.auth.getUserSelectedLibraries();

        const response = await fetch(`http://127.0.0.1:34567/init`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            serverUrl: server.connections[0].uri,
            libraries: libraries,
          }),
        });
        await response.json();

        setIsReady(true);

        return;
      }
    } catch (e: any) {
      // Fetch failed
    }

    // Check process status via IPC
    const status = await window.api.server.getStatus();
    const apiLogs = await window.api.server.getLogs();
    setLogs(apiLogs);

    if (status.startsWith("exited")) {
      setError(`Background service failed to start (${status})`);
      return;
    }

    if (count >= 120) {
      // Increase to 2 minutes
      setError(
        "Connection timeout: Background service is taking too long to respond.",
      );
      return;
    }

    const nextDelay = Math.min(delay * 1.5, 2000); // Slower backoff
    setTimeout(() => checkApi(count + 1, nextDelay), delay);
  };

  useEffect(() => {
    checkApi();
  }, []);

  const handleRetry = () => {
    setError(null);
    setLogs("");
    checkApi(0, 100);
  };

  if (isReady) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#09090b] text-white p-6 overflow-hidden">
      <div className="flex flex-col items-center gap-6 max-w-3xl w-full h-full justify-center">
        {error ? (
          <div className="flex flex-col items-center gap-4 w-full max-h-full">
            <div className="text-red-500 font-bold text-xl flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              {error}
            </div>

            <div className="w-full flex justify-between items-center px-2">
              <span className="text-xs text-white/40 uppercase tracking-widest font-semibold">
                Service Logs
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setLogs("")}
                  className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded transition-colors text-white/50"
                >
                  Clear
                </button>
                <button
                  onClick={handleRetry}
                  className="text-xs px-4 py-1 bg-indigo-600 hover:bg-indigo-500 rounded font-medium transition-all shadow-lg shadow-indigo-500/20"
                >
                  Retry Connection
                </button>
              </div>
            </div>

            <div className="w-full bg-black/80 p-4 rounded-lg border border-white/10 font-mono text-xs text-white/80 whitespace-pre-wrap overflow-auto shadow-inner flex-1">
              {logs || "Waiting for log output..."}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-8">
            <div className="relative">
              {/*<div className="h-16 w-16 animate-spin rounded-full border-4 border-indigo-500/20 border-t-indigo-500 shadow-xl" />*/}
              <Spinner className="size-16" />
              {/*<div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-indigo-500/50">
                {retryCount}
              </div>*/}
            </div>

            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                Initialising Rayna
              </h1>
              <p className="text-white/40 text-sm max-w-xs leading-relaxed">
                Starting background services and preparing your music library.
              </p>
            </div>

            {/*<div className="mt-4 flex items-center gap-2 text-xs text-white/20 font-mono">
              <span className="h-1 w-1 rounded-full bg-white/20" />
              Last check: {lastCheck || 'Starting...'}
            </div>*/}
          </div>
        )}
      </div>
    </div>
  );
}
