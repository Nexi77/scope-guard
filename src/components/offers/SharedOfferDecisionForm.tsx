import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type DecisionTargetKind = "base" | "change";

interface SharedOfferDecisionFormProps {
  token: string;
  targetKind: DecisionTargetKind;
  targetId: string;
  baseRevisionId: string;
  baseRevision: number;
  activeScopeRevision: number;
}

interface DecisionResult {
  target_id?: string;
  outcome?: "accepted" | "rejected";
  decided_at?: string;
  error?: string;
}

interface SharedState {
  base_revision_id?: string;
  base_revision?: number;
  active_scope_revision?: number;
  target_kind?: DecisionTargetKind | null;
  target_id?: string | null;
}

type FieldErrors = Partial<Record<"pin" | "comment", string>>;

export default function SharedOfferDecisionForm({
  token,
  targetKind,
  targetId,
  baseRevisionId,
  baseRevision,
  activeScopeRevision,
}: SharedOfferDecisionFormProps) {
  const [outcome, setOutcome] = useState<"accepted" | "rejected">("accepted");
  const [pin, setPin] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settled, setSettled] = useState<{ outcome: "accepted" | "rejected"; decidedAt: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [focusRequest, setFocusRequest] = useState(0);
  const errorSummaryRef = useRef<HTMLElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const targetLabel = targetKind === "base" ? "offer" : "change";

  useEffect(() => {
    if (focusRequest > 0) errorSummaryRef.current?.focus();
  }, [focusRequest]);

  function clearFieldError(field: keyof FieldErrors) {
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function chooseOutcome(nextOutcome: "accepted" | "rejected") {
    setOutcome(nextOutcome);
    clearFieldError("comment");
  }

  function validate() {
    const next: FieldErrors = {};
    if (!/^\d{6}$/.test(pin)) next.pin = "Enter the six-digit offer PIN.";
    if (outcome === "rejected" && !comment.trim()) next.comment = "Add a comment explaining the rejection.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  const checkFreshness = useCallback(async () => {
    if (stale || settled) return;
    try {
      const response = await fetch(`/api/shared/${encodeURIComponent(token)}/state`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        setStale(true);
        return;
      }
      const state = (await response.json()) as SharedState;
      if (
        state.base_revision_id !== baseRevisionId ||
        state.base_revision !== baseRevision ||
        state.active_scope_revision !== activeScopeRevision ||
        state.target_kind !== targetKind ||
        state.target_id !== targetId
      ) {
        setStale(true);
      }
    } catch {
      // A transient network failure cannot prove the displayed terms changed.
    }
  }, [activeScopeRevision, baseRevision, baseRevisionId, settled, stale, targetId, targetKind, token]);

  useEffect(() => {
    const onFocus = () => void checkFreshness();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkFreshness();
    }, 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [checkFreshness]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (stale || busy || settled) return;
    if (!validate()) {
      setFocusRequest((request) => request + 1);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/shared/${encodeURIComponent(token)}/decision`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          target_kind: targetKind,
          target_id: targetId,
          expected_base_revision: baseRevision,
          expected_active_scope_revision: activeScopeRevision,
          pin,
          outcome,
          ...(outcome === "rejected" ? { rejection_comment: comment.trim() } : {}),
        }),
      });
      const result = (await response.json()) as DecisionResult;
      if (response.status === 409) {
        setStale(true);
        setError(
          "The offer changed after you reviewed it. Refresh the page and review the current terms before deciding.",
        );
      } else if (!response.ok) {
        setError(result.error ?? "Your decision could not be recorded. Check the PIN and try again.");
      } else if (
        result.target_id !== targetId ||
        (result.outcome !== "accepted" && result.outcome !== "rejected") ||
        typeof result.decided_at !== "string"
      ) {
        setError("The saved decision could not be confirmed. Refresh this page to check its status.");
      } else {
        setSettled({ outcome: result.outcome, decidedAt: result.decided_at });
        setNotice(`Decision recorded: ${result.outcome}.`);
      }
    } catch {
      setError("The decision service could not be reached. Try again.");
    } finally {
      setPin("");
      setBusy(false);
    }
  }

  const refresh = () => {
    window.location.reload();
  };

  return (
    <ToastProvider>
      <section
        aria-labelledby="customer-decision-title"
        className="mt-6 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-7 dark:border-slate-600 dark:bg-slate-900"
      >
        <h2 id="customer-decision-title" className="text-xl font-bold text-slate-950 dark:text-white">
          Your decision
        </h2>
        {settled ? (
          <div className="mt-3 space-y-2" role="status" aria-live="polite">
            <p className="font-semibold text-slate-900 dark:text-white">
              This {targetKind === "base" ? "offer" : "change proposal"} was {settled.outcome}.
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Recorded <time dateTime={settled.decidedAt}>{new Date(settled.decidedAt).toLocaleString()}</time>
            </p>
          </div>
        ) : (
          <form className="mt-4 space-y-5" noValidate onSubmit={(event) => void submit(event)}>
            {Object.values(fieldErrors).some(Boolean) ? (
              <section
                ref={errorSummaryRef}
                tabIndex={-1}
                className="border-destructive/30 bg-destructive/5 focus-visible:ring-ring rounded-md border p-4 outline-none focus-visible:ring-2"
                role="alert"
                aria-labelledby="decision-error-summary-title"
              >
                <h3 id="decision-error-summary-title" className="font-semibold">
                  Review these fields before submitting
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {fieldErrors.pin ? (
                    <li>
                      <a
                        href="#decision-pin"
                        className="underline underline-offset-2"
                        onClick={(event) => {
                          event.preventDefault();
                          pinInputRef.current?.focus();
                        }}
                      >
                        Offer PIN: {fieldErrors.pin}
                      </a>
                    </li>
                  ) : null}
                  {fieldErrors.comment ? (
                    <li>
                      <a
                        href="#rejection-comment"
                        className="underline underline-offset-2"
                        onClick={(event) => {
                          event.preventDefault();
                          commentInputRef.current?.focus();
                        }}
                      >
                        Rejection comment: {fieldErrors.comment}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}
            <fieldset disabled={busy || stale} className="space-y-5">
              <legend className="sr-only">Choose whether to accept or reject</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={outcome === "accepted"}
                  onClick={() => {
                    chooseOutcome("accepted");
                  }}
                  className={`focus-visible:outline-success min-h-12 rounded-lg border-2 px-4 py-3 text-left font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${outcome === "accepted" ? "border-success bg-success text-success-foreground" : "border-success/50 bg-success/10 text-success hover:bg-success/15"}`}
                >
                  {`Accept ${targetLabel}`}
                </button>
                <button
                  type="button"
                  aria-pressed={outcome === "rejected"}
                  onClick={() => {
                    chooseOutcome("rejected");
                  }}
                  className={`focus-visible:outline-destructive min-h-12 rounded-lg border-2 px-4 py-3 text-left font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${outcome === "rejected" ? "border-destructive bg-destructive text-destructive-foreground" : "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/15"}`}
                >
                  {`Reject ${targetLabel}`}
                </button>
              </div>
              {outcome === "rejected" && (
                <Field
                  id="rejection-comment"
                  label="Why are you rejecting this proposal?"
                  hint="Up to 1,000 characters."
                  error={fieldErrors.comment}
                  required
                >
                  {(controlProps) => (
                    <Textarea
                      {...controlProps}
                      ref={commentInputRef}
                      value={comment}
                      onChange={(event) => {
                        setComment(event.currentTarget.value);
                        clearFieldError("comment");
                      }}
                      maxLength={1000}
                      rows={4}
                    />
                  )}
                </Field>
              )}
              <Field
                id="decision-pin"
                label="Six-digit offer PIN"
                hint="Enter the PIN provided by the contractor."
                error={fieldErrors.pin}
                required
                className="max-w-xs"
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    ref={pinInputRef}
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    value={pin}
                    onChange={(event) => {
                      setPin(event.currentTarget.value.replace(/\D/g, "").slice(0, 6));
                      clearFieldError("pin");
                    }}
                    className="text-lg tracking-[0.3em]"
                  />
                )}
              </Field>
              {error ? (
                <p className="text-sm font-medium text-red-800 dark:text-red-300" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy || stale}
                className="min-h-12 w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto dark:bg-white dark:text-slate-950"
              >
                {busy ? "Saving decision…" : outcome === "accepted" ? "Confirm acceptance" : "Confirm rejection"}
              </button>
            </fieldset>
            {stale ? (
              <div
                className="rounded-lg border-2 border-amber-700 bg-amber-50 p-4 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100"
                role="alert"
              >
                <p className="font-semibold">These terms may have changed.</p>
                <p className="mt-1 text-sm">Refresh to review the current offer before making a decision.</p>
                <button
                  type="button"
                  onClick={refresh}
                  className="mt-3 min-h-10 rounded-md border border-current px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Refresh and review
                </button>
              </div>
            ) : null}
          </form>
        )}
      </section>
      {notice ? (
        <p className="sr-only" role="status">
          {notice}
        </p>
      ) : null}
      <ToastRoot open={stale} duration={60_000}>
        <ToastTitle>Offer changed</ToastTitle>
        <ToastDescription>Refresh and review the current terms before deciding.</ToastDescription>
        <button
          type="button"
          onClick={refresh}
          className="mt-2 min-h-10 rounded-md border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Refresh page
        </button>
      </ToastRoot>
      <ToastViewport />
    </ToastProvider>
  );
}
