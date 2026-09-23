import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ManageOfferPinProps {
  offerId: string;
  configured: boolean;
}

export default function ManageOfferPin({ offerId, configured }: ManageOfferPinProps) {
  const [isConfigured, setIsConfigured] = useState(configured);
  const [pin, setPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  async function savePin(): Promise<boolean> {
    setBusy(true);
    setError("");
    setPin(null);
    setCopied(false);
    try {
      const response = await fetch(`/api/offers/${encodeURIComponent(offerId)}/pin`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const result = (await response.json()) as { pin?: unknown; error?: unknown };
      const returnedPin = typeof result.pin === "string" ? result.pin : null;
      const errorMessage = typeof result.error === "string" ? result.error : null;
      if (!response.ok || !returnedPin) {
        throw new Error(errorMessage ?? "PIN could not be managed. Try again.");
      }
      setPin(returnedPin);
      setIsConfigured(true);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PIN could not be managed. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset() {
    if (!(await savePin())) setResetDialogOpen(true);
  }

  async function copyPin() {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
    } catch {
      setError("Copy is unavailable. Select the PIN and copy it manually.");
    }
  }

  function closeResult() {
    setPin(null);
    setCopied(false);
    setError("");
  }

  return (
    <div className="mt-4 border-t pt-4">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        Customer PIN: {isConfigured ? "Configured" : "Not configured"}
      </p>
      {isConfigured ? (
        <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className="border-input bg-background focus-visible:ring-ring mt-2 inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
            >
              {busy ? "Working…" : "Reset PIN"}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset this offer’s PIN?</AlertDialogTitle>
              <AlertDialogDescription>
                The current PIN will stop working immediately. The new PIN will be shown once after the reset completes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={confirmReset}>
                {busy ? "Resetting…" : "Reset PIN"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <button
          type="button"
          onClick={savePin}
          disabled={busy}
          className="border-input bg-background focus-visible:ring-ring mt-2 inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
        >
          {busy ? "Working…" : "Generate PIN"}
        </button>
      )}
      {pin ? (
        <div className="bg-secondary mt-3 rounded-md p-3" role="status" aria-live="polite">
          <p className="font-medium">
            New PIN: <output className="font-mono tracking-widest">{pin}</output>
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Copy it now. It will be hidden when you close this result.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyPin}
              className="bg-primary text-primary-foreground focus-visible:ring-ring min-h-10 rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
            >
              {copied ? "Copied" : "Copy PIN"}
            </button>
            <button
              type="button"
              onClick={closeResult}
              className="border-input focus-visible:ring-ring min-h-10 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-destructive mt-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
