import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_OFFER_ITEM,
  calculateOfferItemLine,
  calculateOfferItemsTotal,
  formatMinorAmount,
  OFFER_ITEM_UNITS,
  type OfferItemDraft,
  type OfferItemField,
  type OfferItemValidationError,
} from "@/lib/offer-items";
import type { OfferChangeTemplate } from "@/lib/offer-change-templates";

interface OfferItemsEditorProps {
  items: OfferItemDraft[];
  onChange: (items: OfferItemDraft[]) => void;
  error?: OfferItemValidationError | null;
  disabled?: boolean;
  singleItem?: boolean;
  requiredFields?: boolean;
  stableItemIds?: boolean;
  templates?: OfferChangeTemplate[];
  selectedTemplateIds?: Record<string, string>;
  pendingTemplate?: { itemId: string; templateId: string } | null;
  onTemplateSelect?: (itemId: string, templateId: string) => void;
  onConfirmTemplate?: () => void;
  onCancelTemplate?: () => void;
}

function OfferItemsEditor({
  items,
  onChange,
  error,
  disabled = false,
  singleItem = false,
  requiredFields = false,
  stableItemIds = false,
  templates = [],
  selectedTemplateIds = {},
  pendingTemplate = null,
  onTemplateSelect,
  onConfirmTemplate,
  onCancelTemplate,
}: OfferItemsEditorProps) {
  const total = calculateOfferItemsTotal(items);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const focusedItemId = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingFocusId || focusedItemId.current === pendingFocusId) return;
    const item = document.querySelector<HTMLElement>(`[data-item-id="${pendingFocusId}"] [data-new-item-focus]`);
    if (!item) return;
    item.focus();
    focusedItemId.current = pendingFocusId;
  }, [items, pendingFocusId]);

  function updateItem(index: number, field: OfferItemField, value: string) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  function addItem() {
    const id = stableItemIds ? crypto.randomUUID() : undefined;
    if (id) setPendingFocusId(id);
    onChange([{ ...EMPTY_OFFER_ITEM, ...(id ? { id } : {}) }, ...items]);
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
          const itemId = item.id;
          const fieldError = (field: OfferItemField) =>
            error?.itemIndex === index && error.field === field ? error.message : undefined;
          const lineAmount = calculateOfferItemLine(item);
          const selectedTemplate = itemId
            ? templates.find((template) => template.id === selectedTemplateIds[itemId])
            : undefined;

          return (
            <fieldset
              key={item.id ?? `new-${index}`}
              data-item-id={item.id}
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

              {templates.length > 0 && itemId && onTemplateSelect ? (
                <div className="space-y-2">
                  <Field id={`item-${index}-template`} label={`Template for item ${index + 1}`}>
                    {(controlProps) => (
                      <select
                        {...controlProps}
                        data-template-select
                        data-new-item-focus={index === 0 ? "true" : undefined}
                        className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                        value={selectedTemplateIds[itemId] ?? ""}
                        disabled={disabled}
                        onChange={(event) => {
                          onTemplateSelect(itemId, event.target.value);
                        }}
                      >
                        <option value="">Choose a template (optional)</option>
                        <optgroup label="Starter prompts">
                          {templates
                            .filter((template) => template.contractorId === null)
                            .map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.trade} · {template.name}
                              </option>
                            ))}
                        </optgroup>
                        {templates.some((template) => template.contractorId !== null) ? (
                          <optgroup label="My saved templates">
                            {templates
                              .filter((template) => template.contractorId !== null)
                              .map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.trade} · {template.name}
                                </option>
                              ))}
                          </optgroup>
                        ) : null}
                      </select>
                    )}
                  </Field>
                  {selectedTemplate ? (
                    <div className="bg-secondary space-y-1 rounded-md p-3 text-sm" role="status">
                      {selectedTemplate.prompts.map((prompt) => (
                        <p key={prompt}>{prompt}</p>
                      ))}
                      {selectedTemplate.sellingRateMinor === null || selectedTemplate.laborHoursPerUnit === null ? (
                        <p>Enter or confirm the selling rate and person-hours before saving this offer.</p>
                      ) : null}
                    </div>
                  ) : null}
                  {pendingTemplate?.itemId === itemId ? (
                    <div
                      className="border-primary/30 bg-primary/5 rounded-md border p-3"
                      role="group"
                      aria-label="Confirm template overwrite"
                      aria-live="polite"
                    >
                      <p className="text-sm">
                        This updates the name, unit, rate, and labor defaults. Existing quantity and specification stay
                        as entered. Apply this template?
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={onConfirmTemplate}>
                          Apply template
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={onCancelTemplate}>
                          Keep current values
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <Field id={`item-${index}-name`} label="Item name" required={requiredFields} error={fieldError("name")}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    data-new-item-focus={index === 0 && !templates.length ? "true" : undefined}
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
                  <Field
                    id={`item-${index}-quantity`}
                    label="Quantity"
                    required={requiredFields}
                    error={fieldError("quantity")}
                  >
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
                  <Field id={`item-${index}-unit`} label="Unit" required={requiredFields} error={fieldError("unit")}>
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

              <Field
                id={`item-${index}-specification`}
                label="Specification"
                required={requiredFields}
                error={fieldError("specification")}
              >
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
                  required={requiredFields}
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
                  required={requiredFields}
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
        className={`border-border flex flex-col gap-1 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
          total === null ? "bg-muted/50" : "bg-secondary"
        }`}
        aria-live="polite"
      >
        <div>
          <p className="text-sm font-medium">Calculated offer total</p>
          {total === null ? (
            <p className="text-muted-foreground mt-1 text-sm">
              The total will appear once every work item is complete.
            </p>
          ) : null}
        </div>
        {total !== null ? <span className="text-xl font-semibold">{formatMinorAmount(total)}</span> : null}
      </div>
    </section>
  );
}

export default OfferItemsEditor;
