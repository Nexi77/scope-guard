import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import OfferItemsEditor from "@/components/offers/OfferItemsEditor";
import { formatPersonHours, formatSignedMinorAmount, type OfferChangeItemEffect } from "@/lib/offer-change-estimator";
import { draftFromOfferItem, formatMinorAmount, parseOfferItemDrafts, type OfferItemDraft } from "@/lib/offer-items";
import { parsePlnAmount } from "@/lib/pln";
import { OFFER_ITEM_UNITS } from "@/lib/offer-items";
import type { OfferChangeTemplate } from "@/lib/offer-change-templates";

interface Item {
  id: string;
  name: string;
  quantity: number | string;
  unit: string;
  specification: string;
  selling_rate_minor: number | string;
  labor_hours_per_unit: number | string;
}

function numericStringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value;
  return typeof value === "number" && Number.isSafeInteger(value) ? String(value) : null;
}

function estimateAmount(value: unknown, signed = false): string {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)$/.test(value)) return "Needs assessment";
  const minor = BigInt(value);
  return signed ? formatSignedMinorAmount(minor) : formatMinorAmount(minor);
}

export default function OfferChangeForm({
  offerId,
  scopeRevision,
  items,
  activeDeadline,
  pendingProposalId,
  templates,
}: {
  offerId: string;
  scopeRevision: number;
  items: Item[];
  activeDeadline: string;
  pendingProposalId: string | null;
  templates: OfferChangeTemplate[];
}) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "new");
  const [itemAction, setItemAction] = useState<"update" | "remove" | "replace">("update");
  const newItemId = useRef<string | null>(null);
  const [draft, setDraft] = useState<OfferItemDraft>(() =>
    items[0]
      ? draftFromOfferItem(items[0])
      : { name: "", quantity: "", unit: "", specification: "", sellingRate: "", laborHours: "" },
  );
  const [completedQuantity, setCompletedQuantity] = useState("");
  const [confirmedCredit, setConfirmedCredit] = useState("");
  const [creditDecisionConfirmed, setCreditDecisionConfirmed] = useState(false);
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState(activeDeadline);
  const [adjustment, setAdjustment] = useState("0");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [includeConsequence, setIncludeConsequence] = useState(false);
  const [consequenceName, setConsequenceName] = useState("");
  const [consequenceQuantity, setConsequenceQuantity] = useState("");
  const [consequenceUnit, setConsequenceUnit] = useState("");
  const [consequenceRate, setConsequenceRate] = useState("");
  const [consequenceHours, setConsequenceHours] = useState("");
  const [supersessionConfirmed, setSupersessionConfirmed] = useState(false);
  const [replacementConfirmed, setReplacementConfirmed] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedCompanionIdentity, setSelectedCompanionIdentity] = useState("");
  const [siteFacts, setSiteFacts] = useState("");
  const [estimate, setEstimate] = useState<Record<string, unknown> | null>(null);
  const [previewedInputsKey, setPreviewedInputsKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateNotice, setTemplateNotice] = useState("");
  const [availableTemplates, setAvailableTemplates] = useState(templates);
  const [saveTrade, setSaveTrade] = useState<OfferChangeTemplate["trade"]>("painting");
  const hasPendingProposal = pendingProposalId !== null;
  const current = items.find((item) => item.id === selectedId) ?? null;
  const isNew = selectedId === "new";
  const unitChanged = current !== null && draft.unit !== current.unit;
  const itemEffectAction =
    current === null
      ? "add"
      : itemAction === "remove"
        ? "remove"
        : itemAction === "replace" || unitChanged
          ? "replace"
          : "update";
  const needsCredit =
    current !== null &&
    (itemEffectAction === "remove" ||
      itemEffectAction === "replace" ||
      Number(draft.quantity.replace(",", ".")) < Number(current.quantity));
  const selectedTemplate = availableTemplates.find((template) => template.id === selectedTemplateId) ?? null;
  const inputsKey = JSON.stringify({
    selectedId,
    itemAction,
    draft,
    completedQuantity,
    confirmedCredit,
    description,
    deadline,
    adjustment,
    adjustmentReason,
    includeConsequence,
    consequenceName,
    consequenceQuantity,
    consequenceUnit,
    consequenceRate,
    consequenceHours,
    selectedCompanionIdentity,
    selectedTemplateId,
    siteFacts,
    replacementConfirmed,
  });
  const currentEstimate = previewedInputsKey === inputsKey ? estimate : null;
  const ready = currentEstimate?.status === "ready";

  function applyTemplate(id: string) {
    setSelectedTemplateId(id);
    setReplacementConfirmed(false);
    setEstimate(null);
    const template = availableTemplates.find((candidate) => candidate.id === id);
    if (!template) return;
    setDraft({
      ...(current ? { id: current.id } : {}),
      name: template.name,
      quantity: current ? String(current.quantity) : "1",
      unit: template.unit,
      specification: current?.specification ?? "",
      sellingRate:
        template.sellingRateMinor === null
          ? ""
          : `${BigInt(template.sellingRateMinor) / 100n}.${String(BigInt(template.sellingRateMinor) % 100n).padStart(2, "0")}`,
      laborHours: template.laborHoursPerUnit ?? "",
    });
  }

  async function saveTemplate() {
    setError("");
    setTemplateNotice("");
    if (!draft.name.trim() || !draft.unit) {
      setError("Enter an item name and unit before saving a template.");
      return;
    }
    const rateMinor = draft.sellingRate.trim() ? parsePlnAmount(draft.sellingRate) : null;
    if (draft.sellingRate.trim() && rateMinor === null) {
      setError("Enter a valid selling rate before saving this template.");
      return;
    }
    const hoursText = draft.laborHours.trim().replace(",", ".");
    if (hoursText && !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(hoursText)) {
      setError("Enter person-hours with up to three decimal places before saving this template.");
      return;
    }
    const templateJson = {
      trade: selectedTemplate?.trade ?? saveTrade,
      name: draft.name.trim(),
      unit: draft.unit,
      prompts: selectedTemplate?.prompts ?? ["Confirm the site measurement and specification before use."],
      selling_rate_minor: rateMinor === null ? null : String(rateMinor),
      labor_hours_per_unit: hoursText || null,
      companion_operations: selectedTemplate?.companionOperations ?? [],
    };
    setTemplateBusy(true);
    try {
      const body = new FormData();
      body.set("template_json", JSON.stringify(templateJson));
      const response = await fetch(`/api/offers/${encodeURIComponent(offerId)}/templates`, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const result = (await response.json()) as { error?: string; template?: Record<string, unknown> };
      if (!response.ok || !result.template) {
        setError(result.error ?? "The template could not be saved.");
        return;
      }
      const row = result.template;
      const saved: OfferChangeTemplate = {
        id: String(row.id),
        version: Number(row.version),
        contractorId: "saved",
        trade: row.trade as OfferChangeTemplate["trade"],
        name: String(row.name),
        unit: row.unit as OfferChangeTemplate["unit"],
        prompts: row.prompts as string[],
        sellingRateMinor: numericStringOrNull(row.selling_rate_minor),
        laborHoursPerUnit: numericStringOrNull(row.labor_hours_per_unit),
        companionOperations: row.companion_operations as OfferChangeTemplate["companionOperations"],
      };
      setAvailableTemplates((currentTemplates) => [...currentTemplates, saved]);
      setSelectedTemplateId(saved.id);
      setEstimate(null);
      setTemplateNotice("Template saved to your reusable templates.");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setTemplateBusy(false);
    }
  }

  function applyCompanion(identity: string) {
    setSelectedCompanionIdentity(identity);
    setEstimate(null);
    const operation = selectedTemplate?.companionOperations.find((candidate) => candidate.identity === identity);
    if (!operation) return;
    setIncludeConsequence(true);
    setConsequenceName(operation.name);
    setConsequenceUnit(operation.unit);
    setConsequenceRate(
      operation.sellingRateMinor === null
        ? ""
        : `${BigInt(operation.sellingRateMinor) / 100n}.${String(BigInt(operation.sellingRateMinor) % 100n).padStart(2, "0")}`,
    );
    setConsequenceHours(operation.laborHoursPerUnit ?? "");
  }

  function selectItem(id: string) {
    setSelectedId(id);
    setItemAction("update");
    newItemId.current = null;
    setCompletedQuantity("");
    setConfirmedCredit("");
    setCreditDecisionConfirmed(false);
    setReplacementConfirmed(false);
    const item = items.find((candidate) => candidate.id === id);
    setDraft(
      id === "new" || !item
        ? { name: "", quantity: "", unit: "", specification: "", sellingRate: "", laborHours: "" }
        : draftFromOfferItem(item),
    );
    setEstimate(null);
    setError("");
  }

  async function send(action: "preview" | "record") {
    setError("");
    if (action === "record" && !ready) {
      setError("Preview the current change details before recording them.");
      return;
    }
    if (action === "record" && needsCredit && !creditDecisionConfirmed) {
      setError("Confirm the completed quantity and omission credit before recording, including when either is zero.");
      return;
    }
    const submittedInputsKey = inputsKey;
    const parsed = itemAction === "remove" && current ? null : parseOfferItemDrafts([draft], true);
    if (parsed && "error" in parsed) {
      setError(parsed.error.message);
      return;
    }
    if (!isNew && !current) {
      setError("The selected work item is unavailable. Reload the offer.");
      return;
    }
    if (unitChanged && itemAction === "update" && !replacementConfirmed) {
      setError("Confirm that changing the unit will replace the selected work item.");
      return;
    }
    if (!description.trim()) {
      setError("Describe the proposed change.");
      return;
    }
    if (!deadline) {
      setError("Confirm the target date.");
      return;
    }
    if (hasPendingProposal && !supersessionConfirmed) {
      setError("Confirm that recording this proposal will replace the currently pending proposal.");
      return;
    }
    const completedText = completedQuantity.trim().replace(",", ".");
    if (
      needsCredit &&
      completedText &&
      (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(completedText) || Number(completedText) > Number(current.quantity))
    ) {
      setError("Enter a completed quantity from zero up to the original quantity, with at most three decimal places.");
      return;
    }
    const creditMinor = needsCredit && confirmedCredit.trim() ? parsePlnAmount(confirmedCredit) : null;
    const adjustmentText = adjustment.trim();
    const adjustmentNegative = adjustmentText.startsWith("-") || adjustmentText.startsWith("−");
    const adjustmentMinorAbs = parsePlnAmount(adjustmentNegative ? adjustmentText.slice(1) : adjustmentText);
    if ((needsCredit && confirmedCredit.trim() && creditMinor === null) || adjustmentMinorAbs === null) {
      setError("Enter valid PLN amounts with up to two decimal places.");
      return;
    }
    const beforeItems = current ? parseOfferItemDrafts([draftFromOfferItem(current)], true) : null;
    if (beforeItems && "error" in beforeItems) {
      setError(beforeItems.error.message);
      return;
    }
    const before = beforeItems ? beforeItems.items[0] : null;
    const after = parsed?.items[0] ?? null;
    const effects: OfferChangeItemEffect[] = [];
    if (current && before) {
      effects.push({
        itemId: current.id,
        before,
        after: itemEffectAction === "update" && after ? { ...after, id: current.id } : null,
        ...(needsCredit && completedText ? { completedQuantity: completedText } : {}),
        ...(needsCredit && creditMinor !== null ? { confirmedOmissionCreditMinor: String(creditMinor) } : {}),
      });
    }
    if ((itemEffectAction === "add" || itemEffectAction === "replace") && after) {
      const addedId = (newItemId.current ??= crypto.randomUUID());
      effects.push({ itemId: addedId, before: null, after: { ...after, id: addedId } });
    }
    if (effects.length === 0) {
      setError("Review the affected work item and try again.");
      return;
    }
    const change = {
      expected_scope_revision: scopeRevision,
      expected_pending_change_id: pendingProposalId,
      supersession_confirmed: hasPendingProposal && supersessionConfirmed,
      description,
      target_deadline: deadline,
      effects,
      consequences: includeConsequence
        ? [
            {
              identity: selectedCompanionIdentity || "contractor-confirmed-consequence",
              name: consequenceName,
              quantity: consequenceQuantity,
              unit: consequenceUnit,
              sellingRateMinor: consequenceRate ? String(parsePlnAmount(consequenceRate) ?? "") : "",
              laborHoursPerUnit: consequenceHours,
              specification: consequenceName,
            },
          ]
        : [],
      template_snapshots: selectedTemplate ? [selectedTemplate] : [],
      site_facts: siteFacts,
      commercial_adjustment_minor: String(adjustmentNegative ? -adjustmentMinorAbs : adjustmentMinorAbs),
      commercial_adjustment_reason: adjustmentReason,
    };
    setBusy(true);
    try {
      const body = new FormData();
      body.set("change_json", JSON.stringify(change));
      const response = await fetch(
        `/api/offers/${encodeURIComponent(offerId)}/changes/${action === "preview" ? "preview" : ""}`,
        { method: "POST", body, credentials: "same-origin" },
      );
      const result = (await response.json()) as { error?: string; estimate?: Record<string, unknown> };
      if (!response.ok) {
        setError(result.error ?? "The change could not be processed.");
        if (result.estimate) {
          setEstimate(result.estimate);
          setPreviewedInputsKey(submittedInputsKey);
        }
        return;
      }
      if (action === "record") {
        window.location.reload();
        return;
      }
      setEstimate(result.estimate ?? null);
      setPreviewedInputsKey(submittedInputsKey);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Field id="affected-item" label="Affected agreed work">
        {(props) => (
          <select
            {...props}
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            value={selectedId}
            onChange={(event) => {
              selectItem(event.target.value);
            }}
            disabled={busy}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.quantity} {item.unit}
              </option>
            ))}
            <option value="new">Add new work</option>
          </select>
        )}
      </Field>
      {current ? (
        <Field id="item-action" label="What will happen to this work item?">
          {(props) => (
            <select
              {...props}
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={itemAction}
              onChange={(event) => {
                const nextAction = event.target.value as "update" | "remove" | "replace";
                setItemAction(nextAction);
                setCreditDecisionConfirmed(false);
                newItemId.current = null;
                setReplacementConfirmed(false);
                if (nextAction === "remove") {
                  setSelectedTemplateId("");
                  setSiteFacts("");
                }
                setEstimate(null);
              }}
              disabled={busy}
            >
              <option value="update">Change quantity or details</option>
              <option value="remove">Remove this work item</option>
              <option value="replace">Replace with a new work item</option>
            </select>
          )}
        </Field>
      ) : null}
      <Field id="change-template" label="Work template">
        {(props) => (
          <select
            {...props}
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            value={selectedTemplateId}
            onChange={(event) => {
              applyTemplate(event.target.value);
            }}
            disabled={busy || itemAction === "remove"}
          >
            <option value="">Choose a trade template</option>
            <optgroup label="Starter prompts">
              {availableTemplates
                .filter((template) => template.contractorId === null)
                .map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.trade} · {template.name}
                  </option>
                ))}
            </optgroup>
            {availableTemplates.some((template) => template.contractorId !== null) ? (
              <optgroup label="My saved templates">
                {availableTemplates
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
        <section
          className="bg-secondary space-y-2 rounded-md p-4"
          aria-label={`${selectedTemplate.trade} template prompts`}
        >
          <h3 className="text-sm font-semibold">Confirm these job facts</h3>
          {selectedTemplate.prompts.map((prompt) => (
            <p key={prompt} className="text-sm">
              {prompt}
            </p>
          ))}
          {selectedTemplate.sellingRateMinor === null || selectedTemplate.laborHoursPerUnit === null ? (
            <p className="text-sm">
              This template has no saved rate or effort assumption. Enter or confirm both before recording.
            </p>
          ) : null}
        </section>
      ) : null}
      {selectedTemplate ? (
        <Field id="site-facts" label="Answers to template prompts (required for a ready estimate)">
          {(props) => (
            <Textarea
              {...props}
              maxLength={4000}
              value={siteFacts}
              onChange={(event) => {
                setSiteFacts(event.target.value);
                setEstimate(null);
              }}
              disabled={busy}
            />
          )}
        </Field>
      ) : null}
      <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        {selectedTemplate ? null : (
          <Field id="template-trade" label="Trade for saved template">
            {(props) => (
              <select
                {...props}
                className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                value={saveTrade}
                onChange={(event) => {
                  setSaveTrade(event.target.value as OfferChangeTemplate["trade"]);
                }}
                disabled={templateBusy}
              >
                <option value="painting">Painting</option>
                <option value="tiling">Tiling</option>
                <option value="electrical">Electrical</option>
                <option value="plumbing">Plumbing</option>
              </select>
            )}
          </Field>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={templateBusy || itemAction === "remove"}
          onClick={() => {
            void saveTemplate();
          }}
        >
          {templateBusy ? "Saving template…" : "Save item defaults as a reusable template"}
        </Button>
        {templateNotice ? (
          <p role="status" className="text-sm">
            {templateNotice}
          </p>
        ) : null}
      </div>
      {itemAction === "remove" && current ? (
        <p className="bg-secondary rounded-md p-4 text-sm">
          This proposal removes {current.name} ({current.quantity} {current.unit}) from future work. Confirm completed
          work and the omission credit below.
        </p>
      ) : (
        <OfferItemsEditor
          items={[draft]}
          singleItem
          onChange={(next) => {
            if (next[0].unit !== draft.unit) setReplacementConfirmed(false);
            setDraft(next[0]);
            setEstimate(null);
          }}
          disabled={busy}
        />
      )}
      {unitChanged && itemAction === "update" ? (
        <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={replacementConfirmed}
            onChange={(event) => {
              setReplacementConfirmed(event.target.checked);
              setEstimate(null);
            }}
            disabled={busy}
            className="accent-primary mt-0.5 size-4"
          />
          <span>Changing the unit replaces this work item with a new item identity. Confirm this replacement.</span>
        </label>
      ) : null}
      {current && needsCredit ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="completed-quantity" label={`Completed quantity (of ${current.quantity})`}>
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                value={completedQuantity}
                onChange={(event) => {
                  setCompletedQuantity(event.target.value);
                  setCreditDecisionConfirmed(false);
                  setEstimate(null);
                }}
                disabled={busy}
              />
            )}
          </Field>
          <Field id="omission-credit" label="Confirmed omission credit (PLN)">
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                value={confirmedCredit}
                onChange={(event) => {
                  setConfirmedCredit(event.target.value);
                  setCreditDecisionConfirmed(false);
                  setEstimate(null);
                }}
                disabled={busy}
              />
            )}
          </Field>
        </div>
      ) : null}
      {current && needsCredit ? (
        <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={creditDecisionConfirmed}
            onChange={(event) => {
              setCreditDecisionConfirmed(event.target.checked);
            }}
            disabled={busy || !ready}
            className="accent-primary mt-0.5 size-4"
          />
          <span>
            I confirm the completed quantity and omission credit shown in this estimate, including any zero value.
          </span>
        </label>
      ) : null}
      <Field id="change-description" label="What is changing?">
        {(props) => (
          <Textarea
            {...props}
            maxLength={4000}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setEstimate(null);
            }}
            disabled={busy}
          />
        )}
      </Field>
      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Consequential work</legend>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={includeConsequence}
            onChange={(event) => {
              setIncludeConsequence(event.target.checked);
              setEstimate(null);
            }}
            disabled={busy}
            className="accent-primary size-4"
          />
          Add removal, protection, restoration, testing, or another consequence operation
        </label>
        {includeConsequence ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {selectedTemplate && selectedTemplate.companionOperations.length > 0 ? (
              <Field id="consequence-template" label="Suggested consequence operation">
                {(props) => (
                  <select
                    {...props}
                    className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                    value={selectedCompanionIdentity}
                    onChange={(event) => {
                      applyCompanion(event.target.value);
                    }}
                    disabled={busy}
                  >
                    <option value="">Custom operation</option>
                    {selectedTemplate.companionOperations.map((operation) => (
                      <option key={operation.identity} value={operation.identity}>
                        {operation.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : null}
            {selectedTemplate?.companionOperations.find((operation) => operation.identity === selectedCompanionIdentity)
              ?.prompt ? (
              <p className="text-muted-foreground text-sm sm:col-span-2">
                {
                  selectedTemplate.companionOperations.find(
                    (operation) => operation.identity === selectedCompanionIdentity,
                  )?.prompt
                }
              </p>
            ) : null}
            <Field id="consequence-name" label="Consequence operation">
              {(props) => (
                <Input
                  {...props}
                  value={consequenceName}
                  onChange={(event) => {
                    setConsequenceName(event.target.value);
                    setEstimate(null);
                  }}
                  disabled={busy}
                />
              )}
            </Field>
            <Field id="consequence-quantity" label="Measured quantity">
              {(props) => (
                <Input
                  {...props}
                  inputMode="decimal"
                  value={consequenceQuantity}
                  onChange={(event) => {
                    setConsequenceQuantity(event.target.value);
                    setEstimate(null);
                  }}
                  disabled={busy}
                />
              )}
            </Field>
            <Field id="consequence-unit" label="Unit">
              {(props) => (
                <select
                  {...props}
                  className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                  value={consequenceUnit}
                  onChange={(event) => {
                    setConsequenceUnit(event.target.value);
                    setEstimate(null);
                  }}
                  disabled={busy}
                >
                  <option value="">Choose a unit</option>
                  {OFFER_ITEM_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field id="consequence-rate" label="Confirmed selling rate (PLN/unit)">
              {(props) => (
                <Input
                  {...props}
                  inputMode="decimal"
                  value={consequenceRate}
                  onChange={(event) => {
                    setConsequenceRate(event.target.value);
                    setEstimate(null);
                  }}
                  disabled={busy}
                />
              )}
            </Field>
            <Field id="consequence-hours" label="Confirmed person-hours per unit">
              {(props) => (
                <Input
                  {...props}
                  inputMode="decimal"
                  value={consequenceHours}
                  onChange={(event) => {
                    setConsequenceHours(event.target.value);
                    setEstimate(null);
                  }}
                  disabled={busy}
                />
              )}
            </Field>
          </div>
        ) : null}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="target-deadline" label="Confirmed target date">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={deadline}
              onChange={(event) => {
                setDeadline(event.target.value);
                setEstimate(null);
              }}
              disabled={busy}
            />
          )}
        </Field>
        <Field id="commercial-adjustment" label="Commercial adjustment (PLN, signed)">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={adjustment}
              onChange={(event) => {
                setAdjustment(event.target.value);
                setEstimate(null);
              }}
              disabled={busy}
            />
          )}
        </Field>
      </div>
      <Field id="adjustment-reason" label="Adjustment reason (required when non-zero)">
        {(props) => (
          <Input
            {...props}
            value={adjustmentReason}
            onChange={(event) => {
              setAdjustmentReason(event.target.value);
              setEstimate(null);
            }}
            disabled={busy}
          />
        )}
      </Field>
      {error ? (
        <p role="alert" className="text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
      {currentEstimate ? (
        <section className="bg-secondary space-y-2 rounded-lg p-4" aria-live="polite" aria-label="Estimate preview">
          <h3 className="font-semibold">{ready ? "Estimate ready for confirmation" : "Needs assessment"}</h3>
          <p>Work item change: {estimateAmount(currentEstimate.itemEffectsDeltaMinor, true)}</p>
          {current && needsCredit ? (
            <div className="space-y-1 rounded-md border p-3 text-sm">
              <p>
                Completed quantity: {completedQuantity.trim() || "Needs assessment"} of {current.quantity}{" "}
                {current.unit}
              </p>
              <p>Suggested omission credit: {estimateAmount(currentEstimate.omissionCreditSuggestionMinor)}</p>
              <p>Confirmed omission credit: {estimateAmount(currentEstimate.confirmedOmissionCreditMinor)}</p>
              <p>
                Completed-work reconciliation added back after removing the original line:{" "}
                {currentEstimate.omissionCreditSuggestionMinor !== null &&
                currentEstimate.confirmedOmissionCreditMinor !== null
                  ? estimateAmount(currentEstimate.creditReconciliationMinor)
                  : "Needs assessment"}
              </p>
            </div>
          ) : null}
          <p>Consequential work: {estimateAmount(currentEstimate.consequenceDeltaMinor, true)}</p>
          <p>Separate commercial adjustment: {estimateAmount(currentEstimate.commercialAdjustmentMinor, true)}</p>
          {typeof currentEstimate.commercialAdjustmentReason === "string" &&
          currentEstimate.commercialAdjustmentReason ? (
            <p className="text-sm">Adjustment reason: {currentEstimate.commercialAdjustmentReason}</p>
          ) : null}
          <p>
            Total price adjustment:{" "}
            {formatSignedMinorAmount(
              BigInt(typeof currentEstimate.priceDeltaMinor === "string" ? currentEstimate.priceDeltaMinor : "0"),
            )}
          </p>
          <p>
            Effort:{" "}
            {formatPersonHours(
              BigInt(
                typeof currentEstimate.effortDeltaMicroHours === "string" ? currentEstimate.effortDeltaMicroHours : "0",
              ),
            )}
          </p>
          {(currentEstimate.reasons as string[] | undefined)?.map((reason) => (
            <p key={reason} className="text-sm">
              {reason}
            </p>
          ))}
          {(currentEstimate.missingInputs as string[] | undefined)?.map((missing) => (
            <p key={missing} className="text-destructive text-sm">
              Needs: {missing}
            </p>
          ))}
          <p className="text-sm">Target date: {deadline}</p>
        </section>
      ) : null}
      {hasPendingProposal ? (
        <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={supersessionConfirmed}
            onChange={(event) => {
              setSupersessionConfirmed(event.target.checked);
            }}
            disabled={busy}
            className="accent-primary mt-0.5 size-4"
          />
          <span>
            A proposal is already awaiting the customer. Recording this one will supersede it, and it can no longer be
            decided.
          </span>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void send("preview")}>
          {busy ? "Working…" : "Preview estimate"}
        </Button>
        <Button
          type="button"
          disabled={
            busy ||
            !ready ||
            (needsCredit && !creditDecisionConfirmed) ||
            (hasPendingProposal && !supersessionConfirmed) ||
            (itemAction === "update" && unitChanged && !replacementConfirmed)
          }
          onClick={() => void send("record")}
        >
          Confirm and record change
        </Button>
      </div>
    </div>
  );
}
