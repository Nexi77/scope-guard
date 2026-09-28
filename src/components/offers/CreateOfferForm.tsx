import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, Plus, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import OfferItemsEditor from "@/components/offers/OfferItemsEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_OFFER_ITEM,
  parseOfferItemDrafts,
  type OfferItemDraft,
  type OfferItemValidationError,
} from "@/lib/offer-items";
import type { OfferChangeTemplate } from "@/lib/offer-change-templates";

interface Customer {
  id: string;
  name: string;
}

interface CreateOfferFormProps {
  customers: Customer[];
  templates: OfferChangeTemplate[];
  initialOffer?: {
    sourceOfferId: string;
    customerId: string;
    baseScope: string;
    deadline: string;
    items: OfferItemDraft[];
  } | null;
  serverError?: string | null;
  created: boolean;
  createdOfferId?: string | null;
  createdCustomerId?: string | null;
}

type CustomerMode = "existing" | "new";
type Errors = Partial<Record<"customer" | "scope" | "deadline", string>>;
type PendingTemplate = { itemId: string; templateId: string } | null;

const today = new Date().toISOString().slice(0, 10);

function CreateOfferForm({
  customers,
  templates,
  initialOffer = null,
  serverError,
  created,
  createdOfferId,
  createdCustomerId,
}: CreateOfferFormProps) {
  const initialItemId = useId();
  const initialCustomerIsAvailable = Boolean(
    initialOffer && customers.some((customer) => customer.id === initialOffer.customerId),
  );
  const [customerMode, setCustomerMode] = useState<CustomerMode>(
    initialCustomerIsAvailable || customers.length ? "existing" : "new",
  );
  const [customerId, setCustomerId] = useState(initialCustomerIsAvailable ? (initialOffer?.customerId ?? "") : "");
  const [customerName, setCustomerName] = useState("");
  const [baseScope, setBaseScope] = useState(initialOffer?.baseScope ?? "");
  const [deadline, setDeadline] = useState(initialOffer?.deadline ?? "");
  const [items, setItems] = useState<OfferItemDraft[]>(() =>
    initialOffer
      ? initialOffer.items.map((item, index) => ({ ...item, id: `source-item-${index + 1}` }))
      : [{ ...EMPTY_OFFER_ITEM, id: initialItemId }],
  );
  const [itemTemplateIds, setItemTemplateIds] = useState<Record<string, string>>({});
  const [pendingTemplate, setPendingTemplate] = useState<PendingTemplate>(null);
  const [itemError, setItemError] = useState<OfferItemValidationError | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [focusRequest, setFocusRequest] = useState(serverError ? 1 : 0);
  const errorSummaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focusRequest === 0) return;
    errorSummaryRef.current?.focus();
  }, [focusRequest]);

  const matchingCustomer = useMemo(
    () => customers.find((customer) => customer.name.trim().toLowerCase() === customerName.trim().toLowerCase()),
    [customers, customerName],
  );

  function clearError(field: keyof Errors) {
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function chooseMode(mode: CustomerMode) {
    setCustomerMode(mode);
    setConfirmDuplicate(false);
    setErrors((current) => ({ ...current, customer: undefined }));
  }

  function applyItemTemplate(itemId: string, templateId: string) {
    const template = templates.find((candidate) => candidate.id === templateId);
    const item = items.find((candidate) => candidate.id === itemId);
    if (templateId === "") {
      setItemTemplateIds((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== itemId)));
      setPendingTemplate(null);
      return;
    }
    if (!template || item?.id !== itemId) return;
    const hasValues = [item.name, item.quantity, item.unit, item.specification, item.sellingRate, item.laborHours].some(
      (value) => value.trim().length > 0,
    );
    if (hasValues && itemTemplateIds[itemId] !== templateId) {
      setPendingTemplate({ itemId, templateId });
      return;
    }
    commitItemTemplate(itemId, templateId);
  }

  function commitItemTemplate(itemId: string, templateId: string) {
    const template = templates.find((candidate) => candidate.id === templateId);
    const item = items.find((candidate) => candidate.id === itemId);
    if (!template || !item) return;
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === itemId
          ? {
              ...candidate,
              name: template.name,
              quantity: candidate.quantity.length ? candidate.quantity : "1",
              unit: template.unit,
              specification: candidate.specification,
              sellingRate:
                template.sellingRateMinor === null
                  ? ""
                  : `${BigInt(template.sellingRateMinor) / 100n}.${String(BigInt(template.sellingRateMinor) % 100n).padStart(2, "0")}`,
              laborHours: template.laborHoursPerUnit ?? "",
            }
          : candidate,
      ),
    );
    setItemTemplateIds((current) => {
      return { ...current, [itemId]: templateId };
    });
    setPendingTemplate(null);
  }

  function confirmTemplate() {
    if (!pendingTemplate) return;
    commitItemTemplate(pendingTemplate.itemId, pendingTemplate.templateId);
  }

  function validate() {
    const next: Errors = {};

    if (customerMode === "existing" && !customerId) {
      next.customer = "Choose an existing customer or add a new one.";
    }
    if (customerMode === "new" && !customerName.trim()) {
      next.customer = "Customer name is required.";
    }
    if (customerMode === "new" && matchingCustomer && !confirmDuplicate) {
      next.customer = "Choose whether to reuse the matching customer or create a separate record.";
    }
    if (!baseScope.trim()) next.scope = "Original scope is required.";
    const parsedItems = parseOfferItemDrafts(items);
    if ("error" in parsedItems) setItemError(parsedItems.error);
    else setItemError(null);
    if (!deadline) {
      next.deadline = "Deadline is required.";
    } else if (deadline < today) {
      next.deadline = "Deadline cannot be before today.";
    }

    setErrors(next);
    return Object.keys(next).length === 0 && "items" in parsedItems;
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      event.preventDefault();
      setFocusRequest((request) => request + 1);
    }
  }

  if (created) {
    return (
      <section
        className="border-primary/30 bg-card max-w-xl rounded-xl border p-6 shadow-sm"
        aria-labelledby="offer-created-title"
      >
        <CheckCircle2 className="text-primary mb-4 size-8" aria-hidden="true" />
        <h2 id="offer-created-title" className="text-xl font-semibold">
          Offer created
        </h2>
        <p className="text-muted-foreground mt-2">The original scope and itemized price are ready for review.</p>
        <div className="mt-6 flex flex-col items-start gap-4">
          {createdOfferId ? (
            <a
              href={`/offers/${encodeURIComponent(createdOfferId)}`}
              className="text-primary focus-visible:ring-ring inline-flex text-sm font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
            >
              Review this offer
            </a>
          ) : null}
          {createdCustomerId ? (
            <a
              href={`/offers?customer=${encodeURIComponent(createdCustomerId)}`}
              className="text-primary focus-visible:ring-ring inline-flex text-sm font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
            >
              View this customer’s offers
            </a>
          ) : null}
          <Button asChild>
            <a href="/offers/new">
              <Plus aria-hidden="true" />
              Create another offer
            </a>
          </Button>
        </div>
      </section>
    );
  }

  const hasErrors = Boolean(serverError ?? (Object.values(errors).some(Boolean) || itemError !== null));
  const itemFieldLabels: Record<OfferItemValidationError["field"], string> = {
    name: "item name",
    quantity: "quantity",
    unit: "unit",
    specification: "specification",
    sellingRate: "selling rate",
    laborHours: "labor hours",
  };

  return (
    <form
      method="POST"
      action="/api/offers"
      data-prefilled-source-offer={initialOffer?.sourceOfferId}
      className="bg-card max-w-2xl space-y-6 rounded-xl border p-5 shadow-sm sm:p-6"
      noValidate
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="customer_id" value={customerMode === "existing" ? customerId : ""} />
      <input
        type="hidden"
        name="confirm_duplicate"
        value={customerMode === "new" && confirmDuplicate ? "true" : "false"}
      />

      {initialOffer ? (
        <p className="border-primary/30 bg-primary/5 rounded-md border p-4 text-sm" role="status">
          This is a new offer based on the rejected one. Review and edit the details; submitting creates a separate
          offer and share link. Set its own customer PIN from the new offer before requesting a decision.
        </p>
      ) : null}

      {hasErrors ? (
        <section
          ref={errorSummaryRef}
          tabIndex={-1}
          className="border-destructive/30 bg-destructive/5 focus-visible:ring-ring rounded-md border p-4 outline-none focus-visible:ring-2"
          role="alert"
          aria-labelledby="offer-error-summary-title"
        >
          <h2 id="offer-error-summary-title" className="font-semibold">
            Review these fields before creating the offer
          </h2>
          {serverError ? <p className="mt-2 text-sm">{serverError}</p> : null}
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {errors.customer ? (
              <li>
                <a
                  className="underline underline-offset-2"
                  href={`#${customerMode === "existing" ? "customer-id" : "customer-name"}`}
                >
                  Customer: {errors.customer}
                </a>
              </li>
            ) : null}
            {errors.scope ? (
              <li>
                <a className="underline underline-offset-2" href="#base-scope">
                  Original scope: {errors.scope}
                </a>
              </li>
            ) : null}
            {errors.deadline ? (
              <li>
                <a className="underline underline-offset-2" href="#base-deadline">
                  Deadline: {errors.deadline}
                </a>
              </li>
            ) : null}
            {itemError ? (
              <li>
                <a className="underline underline-offset-2" href={`#item-${itemError.itemIndex}-${itemError.field}`}>
                  Item {itemError.itemIndex + 1} {itemFieldLabels[itemError.field]}: {itemError.message}
                </a>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
      <input
        type="hidden"
        name="items_json"
        value={JSON.stringify(
          (() => {
            const parsed = parseOfferItemDrafts(items);
            return "items" in parsed ? parsed.items : [];
          })(),
        )}
      />

      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">Customer</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant={customerMode === "existing" ? "default" : "outline"}
            onClick={() => {
              chooseMode("existing");
            }}
          >
            <Users aria-hidden="true" />
            Use existing customer
          </Button>
          <Button
            type="button"
            variant={customerMode === "new" ? "default" : "outline"}
            onClick={() => {
              chooseMode("new");
            }}
          >
            <UserPlus aria-hidden="true" />
            Add new customer
          </Button>
        </div>

        {customerMode === "existing" ? (
          <Field id="customer-id" label="Existing customer" required error={errors.customer}>
            {(controlProps) => (
              <Select
                value={customerId}
                onValueChange={(value) => {
                  setCustomerId(value);
                  clearError("customer");
                }}
              >
                <SelectTrigger {...controlProps}>
                  <SelectValue placeholder={customers.length ? "Select a customer" : "No customers yet"} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        ) : (
          <>
            <Field id="customer-name" label="Customer name" required error={errors.customer}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  name="customer_name"
                  value={customerName}
                  onChange={(event) => {
                    setCustomerName(event.target.value);
                    setConfirmDuplicate(false);
                    clearError("customer");
                  }}
                  autoComplete="organization"
                />
              )}
            </Field>
            {matchingCustomer ? (
              <div className="border-primary/30 bg-secondary rounded-md border p-4 text-sm" role="status">
                <p className="font-medium">A customer named “{matchingCustomer.name}” already exists.</p>
                <p className="text-muted-foreground mt-1">Choose how to use this name before creating the offer.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCustomerId(matchingCustomer.id);
                      chooseMode("existing");
                    }}
                  >
                    Reuse existing customer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={confirmDuplicate ? "default" : "outline"}
                    onClick={() => {
                      setConfirmDuplicate(true);
                      clearError("customer");
                    }}
                  >
                    Create a separate customer
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Scope and deadline</legend>
        <Field id="base-scope" label="Original scope" required error={errors.scope}>
          {(controlProps) => (
            <Textarea
              {...controlProps}
              name="base_scope"
              value={baseScope}
              onChange={(event) => {
                setBaseScope(event.target.value);
                clearError("scope");
              }}
              rows={5}
            />
          )}
        </Field>
        <Field id="base-deadline" label="Deadline" required error={errors.deadline}>
          {(controlProps) => (
            <Input
              {...controlProps}
              name="base_deadline"
              type="date"
              value={deadline}
              min={today}
              onChange={(event) => {
                setDeadline(event.target.value);
                clearError("deadline");
              }}
            />
          )}
        </Field>
      </fieldset>

      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Templates fill defaults for one item at a time. Starter prompts have no market rates; confirm each rate and
          effort assumption.
        </p>
        <OfferItemsEditor
          items={items}
          onChange={(nextItems) => {
            setItems(nextItems);
            setItemError(null);
          }}
          error={itemError}
          requiredFields
          stableItemIds
          templates={templates}
          selectedTemplateIds={itemTemplateIds}
          pendingTemplate={pendingTemplate}
          onTemplateSelect={applyItemTemplate}
          onConfirmTemplate={confirmTemplate}
          onCancelTemplate={() => {
            setPendingTemplate(null);
          }}
        />
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto">
        Create offer
      </Button>
    </form>
  );
}

export default CreateOfferForm;
