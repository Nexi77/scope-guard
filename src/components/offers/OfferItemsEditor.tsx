import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateOfferItemLine,
  calculateOfferItemsTotal,
  formatMinorAmount,
  OFFER_ITEM_UNITS,
  type OfferItemDraft,
  type OfferItemField,
  type OfferItemValidationError,
} from "@/lib/offer-items";

interface OfferItemsEditorProps {
  items: OfferItemDraft[];
  onChange: (items: OfferItemDraft[]) => void;
  error?: OfferItemValidationError | null;
  disabled?: boolean;
  singleItem?: boolean;
}

function OfferItemsEditor({ items, onChange, error, disabled = false, singleItem = false }: OfferItemsEditorProps) {
  const total = calculateOfferItemsTotal(items);

  function updateItem(index: number, field: OfferItemField, value: string) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    onChange([...items, { name: "", quantity: "", unit: "", specification: "", sellingRate: "", laborHours: "" }]);
  }

  function removeItem(index: number) {
    if (items.length < 2) return;
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <section aria-labelledby="offer-items-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="offer-items-title" className="text-base font-semibold">
            Work items
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Add at least one item. The saved total is calculated from these lines.
          </p>
        </div>
        {!singleItem ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            disabled={disabled || items.length >= 100}
          >
            <Plus aria-hidden="true" />
            Add item
          </Button>
        ) : null}
      </div>

      <div className="space-y-4">
        {items.map((item, index) => {
          const fieldError = (field: OfferItemField) =>
            error?.itemIndex === index && error.field === field ? error.message : undefined;
          const lineAmount = calculateOfferItemLine(item);

          return (
            <fieldset
              key={item.id ?? `new-${index}`}
              className="bg-background space-y-4 rounded-lg border p-4 sm:p-5"
              disabled={disabled}
            >
              <legend className="sr-only">Work item {index + 1}</legend>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Item {index + 1}</h3>
                {!singleItem ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() => {
                      removeItem(index);
                    }}
                    disabled={disabled || items.length < 2}
                  >
                    <Trash2 aria-hidden="true" />
                    Remove
                  </Button>
                ) : null}
              </div>

              <Field id={`item-${index}-name`} label="Item name" error={fieldError("name")}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    value={item.name}
                    maxLength={200}
                    onChange={(event) => {
                      updateItem(index, "name", event.target.value);
                    }}
                    autoComplete="off"
                  />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                  <Field id={`item-${index}-quantity`} label="Quantity" error={fieldError("quantity")}>
                    {(controlProps) => (
                      <Input
                        {...controlProps}
                        inputMode="decimal"
                        placeholder="1.000"
                        value={item.quantity}
                        onChange={(event) => {
                          updateItem(index, "quantity", event.target.value);
                        }}
                      />
                    )}
                  </Field>
                  <Field id={`item-${index}-unit`} label="Unit" error={fieldError("unit")}>
                    {(controlProps) => (
                      <select
                        {...controlProps}
                        value={item.unit}
                        onChange={(event) => {
                          updateItem(index, "unit", event.target.value);
                        }}
                        className="border-input bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
                      >
                        <option value="">Choose unit</option>
                        {OFFER_ITEM_UNITS.map(({ value, label }) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>
              </div>

              <Field id={`item-${index}-specification`} label="Specification" error={fieldError("specification")}>
                {(controlProps) => (
                  <Textarea
                    {...controlProps}
                    className="min-h-28 resize-none"
                    rows={4}
                    maxLength={2000}
                    value={item.specification}
                    onChange={(event) => {
                      updateItem(index, "specification", event.target.value);
                    }}
                  />
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id={`item-${index}-rate`}
                  label="Selling rate (PLN per unit)"
                  hint="Customer-facing final price per unit."
                  error={fieldError("sellingRate")}
                >
                  {(controlProps) => (
                    <Input
                      {...controlProps}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={item.sellingRate}
                      onChange={(event) => {
                        updateItem(index, "sellingRate", event.target.value);
                      }}
                    />
                  )}
                </Field>
                <Field
                  id={`item-${index}-labor`}
                  label="Labor hours per unit (contractor-only)"
                  hint="Private planning assumption. It is not shown to customers."
                  error={fieldError("laborHours")}
                >
                  {(controlProps) => (
                    <Input
                      {...controlProps}
                      inputMode="decimal"
                      placeholder="0.000"
                      value={item.laborHours}
                      onChange={(event) => {
                        updateItem(index, "laborHours", event.target.value);
                      }}
                    />
                  )}
                </Field>
              </div>

              <p className="text-muted-foreground border-t pt-3 text-sm" aria-live="polite">
                Line amount:{" "}
                <span className="text-foreground font-semibold">
                  {lineAmount === null ? "Complete item details" : formatMinorAmount(lineAmount)}
                </span>
              </p>
            </fieldset>
          );
        })}
      </div>

      <div
        className="bg-secondary flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3"
        aria-live="polite"
      >
        <span className="font-medium">Calculated offer total</span>
        <span className="text-lg font-semibold">
          {total === null ? "Complete item details" : formatMinorAmount(total)}
        </span>
      </div>
    </section>
  );
}

export default OfferItemsEditor;
