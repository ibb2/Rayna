import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/auth")({
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function authenticate() {
    try {
      setLoading(true);
      await window.api.auth.generateClientIdentifier();
      await window.api.auth.generateKeyPair();
      await window.api.auth.generatePin();
      const { authUrl, plexId } = await window.api.auth.checkPin();

      // Open the authentication URL in the default browser
      if (authUrl) {
        window.open(authUrl, "_blank");
      }

      // Poll for the token
      const pollInterval = setInterval(async () => {
        try {
          const status = await window.api.auth.checkPinStatus(plexId);

          if (status.authToken || status.auth_token) {
            clearInterval(pollInterval);
            setSuccess(true);

            // Wait a moment to show success message before redirecting
            setTimeout(() => {
              navigate({
                to: "/setup",
                replace: true,
              });
            }, 1500);
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 2000);

      // Stop polling after 2 minutes (timeout)
      setTimeout(() => {
        clearInterval(pollInterval);
        setLoading(false);
      }, 120000);
    } catch (error) {
      console.error("Authentication error:", error);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-12 overflow-y-auto p-4 items-center justify-items-center justify-center h-full">
      <h1 className="scroll-m-20 text-center text-4xl font-bold tracking-tight text-balance">
        Rayna for <span className="text-[#e5a00d] font-bold">Plex</span>
      </h1>
      {!loading && !success && (
        <Button
          variant={"secondary"}
          className="w-1/2 max-w-1/2"
          onClick={() => {
            authenticate();
          }}
        >
          Sign in with Plex
        </Button>
      )}
      {loading && !success && (
        <div className="flex flex-col gap-4 items-center justify-items-center justify-center">
          <Spinner className="size-8" />
          <div className="flex flex-col items-center">
            <h1 className="text-muted-foreground">
              Waiting for Authentication
            </h1>
            <p className="text-muted-foreground">Please continue in browser</p>
          </div>
        </div>
      )}
      {success && (
        <div className="flex flex-col gap-4 items-center justify-items-center justify-center animate-in fade-in zoom-in duration-300">
          <div className="bg-green-500/10 text-green-500 p-4 rounded-full">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide lucide-check"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div className="flex flex-col items-center">
            <h1 className="text-xl font-semibold">
              Successfully Authenticated!
            </h1>
            <p className="text-muted-foreground">Redirecting...</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Auth;
