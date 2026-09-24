import type { OfferItemUnit } from "./offer-items.ts";
import type { OfferChangeOperation } from "./offer-change-estimator.ts";

export type OfferTrade = "painting" | "tiling" | "electrical" | "plumbing";

export interface OfferChangeTemplate {
  id: string;
  version: number;
  contractorId: string | null;
  trade: OfferTrade;
  name: string;
  unit: OfferItemUnit;
  prompts: string[];
  sellingRateMinor: string | null;
  laborHoursPerUnit: string | null;
  companionOperations: (Pick<OfferChangeOperation, "identity" | "name" | "unit" | "specification"> & {
    sellingRateMinor: string | null;
    laborHoursPerUnit: string | null;
    prompt: string;
  })[];
}

export const STARTER_OFFER_CHANGE_TEMPLATES: readonly OfferChangeTemplate[] = [
  {
    id: "starter-painting-area",
    version: 1,
    contractorId: null,
    trade: "painting",
    name: "Painted area",
    unit: "m²",
    prompts: [
      "What substrate and condition are present?",
      "How many coats and colors are required?",
      "Is the room occupied or furnished?",
    ],
    sellingRateMinor: null,
    laborHoursPerUnit: null,
    companionOperations: [
      {
        identity: "painting.protection",
        name: "Protect room and surfaces",
        unit: "hour",
        specification: "Protection and preparation",
        sellingRateMinor: null,
        laborHoursPerUnit: null,
        prompt: "Is additional protection or preparation required?",
      },
      {
        identity: "painting.extra-coat",
        name: "Additional coat",
        unit: "m²",
        specification: "Additional paint coat",
        sellingRateMinor: null,
        laborHoursPerUnit: null,
        prompt: "Is an additional coat required?",
      },
    ],
  },
  {
    id: "starter-tiling-area",
    version: 1,
    contractorId: null,
    trade: "tiling",
    name: "Tiled area",
    unit: "m²",
    prompts: [
      "What tile specification and format are used?",
      "What is the substrate condition?",
      "How much work is already completed?",
      "Are tiles or materials already committed?",
    ],
    sellingRateMinor: null,
    laborHoursPerUnit: null,
    companionOperations: [
      {
        identity: "tiling.removal",
        name: "Remove existing finish",
        unit: "m²",
        specification: "Removal and disposal scope to confirm",
        sellingRateMinor: null,
        laborHoursPerUnit: null,
        prompt: "Does existing work need removal or disposal?",
      },
      {
        identity: "tiling.restoration",
        name: "Restore substrate",
        unit: "m²",
        specification: "Substrate restoration scope to confirm",
        sellingRateMinor: null,
        laborHoursPerUnit: null,
        prompt: "Does the substrate need repair before tiling?",
      },
    ],
  },
  {
    id: "starter-electrical-point",
    version: 1,
    contractorId: null,
    trade: "electrical",
    name: "Electrical point",
    unit: "piece",
    prompts: [
      "What route length and wall construction apply?",
      "At what installation stage is the work?",
      "Is making good included?",
    ],
    sellingRateMinor: null,
    laborHoursPerUnit: null,
    companionOperations: [
      {
        identity: "electrical.chasing",
        name: "Route preparation",
        unit: "m",
        specification: "Route and wall condition to confirm",
        sellingRateMinor: null,
        laborHoursPerUnit: null,
        prompt: "Is route preparation or chasing required?",
      },
      {
        identity: "electrical.restoration",
        name: "Make good affected surface",
        unit: "m²",
        specification: "Restoration area to confirm",
        sellingRateMinor: null,
        laborHoursPerUnit: null,
        prompt: "Is surface restoration required?",
      },
    ],
  },
  {
    id: "starter-plumbing-fixture",
    version: 1,
    contractorId: null,
    trade: "plumbing",
    name: "Plumbing fixture",
    unit: "piece",
    prompts: [
      "What fixture and connection specification apply?",
      "What access and pipe route are available?",
      "What installation stage and isolation work apply?",
    ],
    sellingRateMinor: null,
    laborHoursPerUnit: null,
    companionOperations: [
      {
        identity: "plumbing.removal",
        name: "Remove existing fixture",
        unit: "piece",
        specification: "Removal and disposal scope to confirm",
        sellingRateMinor: null,
        laborHoursPerUnit: null,
        prompt: "Does an existing fixture need removal?",
      },
      {
        identity: "plumbing.testing",
        name: "Test completed connections",
        unit: "hour",
        specification: "Testing scope to confirm",
        sellingRateMinor: null,
        laborHoursPerUnit: null,
        prompt: "What testing is included in this change?",
      },
    ],
  },
];

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}

export function snapshotOfferChangeTemplate(template: OfferChangeTemplate): Readonly<OfferChangeTemplate> {
  return freezeDeep(structuredClone(template));
}

export function templateIsReady(template: OfferChangeTemplate): boolean {
  return template.sellingRateMinor !== null && template.laborHoursPerUnit !== null;
}

export type SavedOfferChangeTemplate = Omit<OfferChangeTemplate, "contractorId"> & { contractorId: string };
