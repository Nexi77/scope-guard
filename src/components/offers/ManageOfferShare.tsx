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

interface ManageOfferShareProps {
  offerId: string;
  token: string;
  revoked: boolean;
  origin: string;
}

export default function ManageOfferShare({ offerId, token, revoked, origin }: ManageOfferShareProps) {
  const [shareToken, setShareToken] = useState(token);
  const [isRevoked, setIsRevoked] = useState(revoked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const shareUrl = `${origin}/shared/${shareToken}`;

  async function updateShare(action: "revoke" | "reshare") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/offers/${encodeURIComponent(offerId)}/share`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as { share_token?: unknown; error?: unknown };
      if (!response.ok)
        throw new Error(typeof result.error === "string" ? result.error : "Share link could not be managed.");
      if (action === "revoke") {
        setIsRevoked(true);
        setNotice("The customer link has been revoked.");
      } else if (typeof result.share_token === "string") {
        setShareToken(result.share_token);
        setIsRevoked(false);
        setNotice("A new customer link is ready.");
      } else {
        throw new Error("A replacement link could not be created.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Share link could not be managed.");
    } finally {
      setBusy(false);
      setDialogOpen(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Link copied.");
      setError("");
    } catch {
      setError("Copy is unavailable. Select the link text and copy it manually.");
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        Customer link: {isRevoked ? "Revoked" : "Active"}
      </p>
      {isRevoked ? (
        <button
          type="button"
          onClick={() => updateShare("reshare")}
          disabled={busy}
          className="bg-primary text-primary-foreground focus-visible:ring-ring inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
        >
          {busy ? "Working…" : "Create replacement link"}
        </button>
      ) : (
        <>
          <label className="block text-sm font-medium" htmlFor={`share-url-${offerId}`}>
            Shared offer URL
          </label>
          <input
            id={`share-url-${offerId}`}
            className="border-input bg-background min-h-10 w-full rounded-md border px-3 text-sm"
            type="text"
            readOnly
            value={shareUrl}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void copyLink();
              }}
              className="bg-primary text-primary-foreground min-h-10 rounded-md px-3 text-sm font-medium"
            >
              Copy link
            </button>
            <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  className="border-input bg-background min-h-10 rounded-md border px-3 text-sm font-medium"
                >
                  Revoke link
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke this customer link?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Anyone using the current URL will lose access immediately. You can create a replacement later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={busy}
                    onClick={() => {
                      void updateShare("revoke");
                    }}
                  >
                    {busy ? "Revoking…" : "Revoke link"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
      {notice ? (
        <p className="text-sm" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
