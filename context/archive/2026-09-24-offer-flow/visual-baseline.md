# Authenticated before views

Captured on 2026-09-24 against the local Supabase stack and Astro dev server, before the offer UI markup changed. The account and customer are local test records. No customer PIN was configured.

| View   | State                                                            | Desktop (1440 × 900)        | Mobile (390 × 844)         |
| ------ | ---------------------------------------------------------------- | --------------------------- | -------------------------- |
| Create | Empty new-offer form                                             | `before-create-desktop.png` | `before-create-mobile.png` |
| Detail | Pending initial offer, one item, PLN 900.00, deadline 2026-10-24 | `before-detail-desktop.png` | `before-detail-mobile.png` |
| List   | Baseline customer selected, one pending offer                    | `before-list-desktop.png`   | `before-list-mobile.png`   |

Local comparison record: offer `730e1cb9-ead2-4752-8845-b1bab521c1cf`, customer `12230fda-ab72-4983-b5e8-99fe8395476c`. The initial pending state is intentionally retained for the after comparison. Screenshots contain no credential or PIN values.

## After views (2026-09-25; grouped list refreshed 2026-09-27)

Captured against local Supabase and the current authenticated development session at desktop 1440 × 900 and mobile 390 × 844.

The before PNGs are full-page captures taken at those viewport sizes; their pixel heights can exceed the viewport. The after images are viewport captures. The grouped-list desktop image was refreshed at 1440 × 900 to match the before viewport, and the mobile image is 390 × 844.

| View          | Desktop                     | Mobile                     | State                                                                                                             |
| ------------- | --------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Grouped list  | `after-list-desktop.jpg`    | `after-list-mobile.jpg`    | Customer `f6774c5b-0cc5-4ffd-a34f-bc74ba4cadd1` expanded with one pending offer; customer and offer rows visible. |
| Creation      | `after-create-desktop.jpg`  | `after-create-mobile.jpg`  | Empty ordered creation form.                                                                                      |
| Current offer | `after-detail-desktop.jpg`  | `after-detail-mobile.jpg`  | Pending initial offer `7adf403d-5353-48f2-9de2-a68976185d1b`, PLN 1,250.00, deadline 2026-12-31.                  |
| History       | `after-history-desktop.jpg` | `after-history-mobile.jpg` | History route for the pending offer.                                                                              |
| Pending edit  | `after-edit-desktop.jpg`    | `after-edit-mobile.jpg`    | Eligible correction route for the pending offer.                                                                  |

The original offer still exists locally, but its linked customer was initially unavailable because the browser session belonged to a different contractor. Row-level security correctly restricts customer reads to `contractor_id = auth.uid()`; no isolation policy was changed. The supplemental comparison below was captured after signing into the original local test account.

The grouped list captures were refreshed after adding a stronger nested-section background and left accent; the mobile capture is scrolled to show the expanded offer. The local browser confirmed the expanded customer button, offer action menu (Open, History, Edit), and no horizontal overflow at 390 px. No captured list row displays a PIN value. The accepted change-proposal route is covered by smoke tests but has no after screenshot because this baseline offer is pending.

## Same-record comparison (2026-09-27)

After authenticating as the original local test owner, captured the original baseline customer and offer in the current UI. The list shows the same customer, scope, pending status, PLN 900.00 total, and 2026-10-24 deadline as the before state. These supplemental screenshots were captured as full-page images at desktop viewport 1440 × 900 and mobile viewport 390 × 844; image heights vary with page content.

| View | Desktop | Mobile | State |
| --- | --- | --- | --- |
| Grouped list | `after-list-same-record-desktop.jpg` | `after-list-same-record-mobile.jpg` | Baseline customer and original pending offer expanded. |
| Create | `after-create-same-account-desktop.jpg` | `after-create-same-account-mobile.jpg` | Empty creation form, same authenticated account. |
| Current offer | `after-detail-same-record-desktop.jpg` | `after-detail-same-record-mobile.jpg` | Original pending offer, same scope, price, deadline, and item. |
| History | `after-history-same-record-desktop.jpg` | `after-history-same-record-mobile.jpg` | Original offer history. |
| Pending edit | `after-edit-same-record-desktop.jpg` | `after-edit-same-record-mobile.jpg` | Original offer in its eligible correction state. |
