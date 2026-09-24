import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";
import OfferItemsEditor from "@/components/offers/OfferItemsEditor";
import { parseOfferItemDrafts, type OfferItemDraft, type OfferItemValidationError } from "@/lib/offer-items";

export default function ReplacePendingOfferForm({
  offerId,
  revision,
  initialScope,
  initialDeadline,
  initialItems,
  showSuccessToast,
}: {
  offerId: string;
  revision: number;
  initialScope: string;
  initialDeadline: string;
  initialItems: OfferItemDraft[];
  showSuccessToast: boolean;
}) {
  const [scope, setScope] = useState(initialScope);
  const [deadline, setDeadline] = useState(initialDeadline);
  const [items, setItems] = useState(initialItems.map(({ id: _id, ...item }) => item));
  const [error, setError] = useState("");
  const [itemError, setItemError] = useState<OfferItemValidationError | null>(null);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ kind: "success" | "error"; description: string } | null>(() =>
    showSuccessToast
      ? {
          kind: "success",
          description: "The pending offer was replaced. Its earlier revision remains in history.",
        }
      : null,
  );

  useEffect(() => {
    if (!showSuccessToast) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [showSuccessToast]);

  function notifyFailure(message: string) {
    setError(message);
    setNotification({ kind: "error", description: message });
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotification(null);
    if (!scope.trim() || scope.length > 4000) {
      notifyFailure("Enter the offer scope in up to 4,000 characters.");
      return;
    }
    const parsed = parseOfferItemDrafts(items);
    if ("error" in parsed) {
      setItemError(parsed.error);
      notifyFailure(parsed.error.message);
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.set("expected_revision", String(revision));
      body.set("base_scope", scope);
      body.set("base_deadline", deadline);
      body.set("items_json", JSON.stringify(parsed.items));
      const response = await fetch(`/api/offers/${encodeURIComponent(offerId)}/revision`, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        notifyFailure(result.error ?? "Offer revision failed. Reload and try again.");
        return;
      }
      window.location.assign(`/offers/${encodeURIComponent(offerId)}?notice=revision-replaced`);
    } catch {
      notifyFailure("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ToastProvider swipeDirection="right">
      <form className="space-y-5" onSubmit={submit} noValidate>
        <p className="text-muted-foreground text-sm">
          Submitting replaces the pending offer and keeps its earlier revision in history.
        </p>
        <Field id="replacement-scope" label="Offer scope">
          {(props) => (
            <Textarea
              {...props}
              value={scope}
              maxLength={4000}
              onChange={(event) => {
                setScope(event.target.value);
              }}
              disabled={saving}
            />
          )}
        </Field>
        <Field id="replacement-deadline" label="Target deadline">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={deadline}
              onChange={(event) => {
                setDeadline(event.target.value);
              }}
              disabled={saving}
            />
          )}
        </Field>
        <OfferItemsEditor
          items={items}
          onChange={(next) => {
            setItems(next);
            setItemError(null);
          }}
          error={itemError}
          disabled={saving}
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving revision…" : "Replace pending offer"}
        </Button>
      </form>
      {notification ? (
        <ToastRoot
          open
          type={notification.kind === "error" ? "foreground" : "background"}
          onOpenChange={(open) => {
            if (!open) setNotification(null);
          }}
          className={notification.kind === "error" ? "border-destructive/50" : "border-primary/40"}
        >
          <ToastTitle>{notification.kind === "success" ? "Offer replaced" : "Offer not replaced"}</ToastTitle>
          <ToastDescription>{notification.description}</ToastDescription>
          <ToastClose />
        </ToastRoot>
      ) : null}
      <ToastViewport />
    </ToastProvider>
  );
}
