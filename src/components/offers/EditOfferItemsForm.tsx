import { useState } from "react";

import { Button } from "@/components/ui/button";
import OfferItemsEditor from "@/components/offers/OfferItemsEditor";
import { parseOfferItemDrafts, type OfferItemDraft, type OfferItemValidationError } from "@/lib/offer-items";

interface EditOfferItemsFormProps {
  offerId: string;
  revision: number;
  initialItems: OfferItemDraft[];
}

function EditOfferItemsForm({ offerId, revision, initialItems }: EditOfferItemsFormProps) {
  const [items, setItems] = useState(initialItems);
  const [itemError, setItemError] = useState<OfferItemValidationError | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const parsed = parseOfferItemDrafts(items, true);
    if ("error" in parsed) {
      setItemError(parsed.error);
      return;
    }

    setItemError(null);
    setSaving(true);
    try {
      const body = new FormData();
      body.set("expected_revision", String(revision));
      body.set("items_json", JSON.stringify(parsed.items));
      const response = await fetch(`/api/offers/${encodeURIComponent(offerId)}/items`, {
        method: "POST",
        body,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setFormError(result.error ?? "We couldn't save these items. Reload the offer and try again.");
        return;
      }
      window.location.reload();
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <OfferItemsEditor
        items={items}
        onChange={(nextItems) => {
          setItems(nextItems);
          setItemError(null);
          setFormError("");
        }}
        error={itemError}
        disabled={saving}
      />
      {formError ? (
        <p
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
          role="alert"
        >
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving items…" : "Save item changes"}
      </Button>
    </form>
  );
}

export default EditOfferItemsForm;
