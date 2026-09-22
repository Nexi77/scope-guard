# Warm Sign-in Theme Implementation Plan

## Overview

Restyle the existing sign-in screen around a compact warm amber/brown semantic palette supplied by the user. The change removes the screen's cosmic blue/purple styling without altering authentication behavior.

## Current State Analysis

- `src/styles/global.css:6-110` already defines and publishes the semantic Tailwind roles needed by the UI.
- `src/pages/auth/signin.astro:9-21` and the auth form primitives use direct cosmic, white, blue, purple, and red values.
- `src/components/ui/button.tsx:7-48` is the existing token-aware button implementation.

## Desired End State

The sign-in screen reads as a calm, warm product entry point: a clear card hierarchy, legible labels, and a single amber primary action. Default, hover, keyboard-focus, validation-error, and pending states use semantic tokens and remain usable on desktop and one mobile width.

### Key Discoveries:

- The token source is already compatible with the supplied `@theme inline` structure (`src/styles/global.css:6-110`).
- The user-supplied source values are captured in `context/changes/sign-in-theme/theme-values.css` and intentionally omit unused categories.
- The current sign-in route and form action are behaviorally covered by `scripts/smoke.mjs:48-62` and must remain unchanged.

## What We're NOT Doing

- Changing sign-in, sign-up, dashboard, API, middleware, or redirect behavior.
- Adding a new component library, font dependency, visual-test dependency, or dark-mode switch.
- Applying chart, sidebar, or unused typography tokens from the supplied snippet.
- Extracting the duplicated sign-in/sign-up page shell in this change.

## Implementation Approach

Keep values at the existing token layer, then replace screen and shared-auth literals with semantic utilities. Preserve the existing repo button and form APIs, adding only the missing token-driven focus styling to the password toggle. Capture desktop and mobile screenshots as the visual gate rather than adding a screenshot framework.

## Phase 1: Compact tokens and sign-in surface

### Overview

Map only the supplied warm roles the active authentication UI needs and restyle the page shell to use them.

### Changes Required:

#### 1. Core semantic values

**File**: `src/styles/global.css`

**Intent**: Replace the active core color, radius, and shadow values with the compact warm palette so semantic utilities remain the sole source of presentation values.

**Contract**: Preserve the existing token names and `@theme inline` publication; update only roles used by the auth UI. Leave the legacy `bg-cosmic` utility intact because the sign-up and dashboard currently consume it outside this view's scope.

#### 2. Sign-in page shell

**File**: `src/pages/auth/signin.astro`

**Intent**: Replace the cosmic glass card with a semantic surface that emphasizes the sign-in task and account link.

**Contract**: The page retains its title, `SignInForm`, server-error input, sign-up link, route, and desktop/mobile centered layout; it uses no raw palette literals.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- The sign-in screen has the intended warm surface and amber primary hierarchy at desktop and mobile widths.
- The form action and sign-up link retain their existing destinations.

**Implementation Note**: After completing this phase and all automated verification passes, inspect the desktop and mobile screenshots before treating the visual work as complete.

---

## Phase 2: Token-driven form states

### Overview

Make the existing shared controls on the screen inherit the new contract for normal, interactive, and invalid states.

### Changes Required:

#### 1. Shared auth controls

**Files**: `src/components/auth/FormField.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/ServerError.tsx`

**Intent**: Replace direct color and duplicated button styling with the existing semantic token roles and restore visible keyboard focus to the password control.

**Contract**: The components retain their current props, validation messages, pending behavior, accessible labels, and form submissions. Default, hover, focus, disabled, error, and loading presentations use semantic color utilities.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes after the component updates.
- `npm run build` passes after the component updates.

#### Manual Verification:

- Empty submit renders field errors; invalid fields and a server error use the destructive token.
- Tab navigation visibly focuses email, password, password visibility, submit button, and account link.
- The submit button visibly enters its existing pending state, and the screen remains readable at a mobile width.

**Implementation Note**: After completing this phase and all automated verification passes, inspect the final desktop and mobile screenshots and verify the named interaction states.

---

## Testing Strategy

### Unit Tests:

- Preserve the existing client-side validation behavior in `SignInForm`; no new behavior needs unit coverage.

### Integration Tests:

- Preserve existing HTTP smoke coverage of incorrect and successful sign-in redirects.

### Manual Testing Steps:

1. Open `/auth/signin` at desktop and mobile widths and compare the visual hierarchy.
2. Submit blank values to inspect both validation errors.
3. Trigger a safe server error using the existing query parameter and inspect the error treatment.
4. Navigate the screen with Tab and verify each named control has visible focus.

## Performance Considerations

The change is CSS and class-name only; it adds no request, runtime data, or dependency work.

## Migration Notes

Not applicable.

## References

- Research: `context/changes/sign-in-theme/research.md`
- Source values: `context/changes/sign-in-theme/theme-values.css`
- `src/styles/global.css:6-110`
- `src/components/ui/button.tsx:7-48`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Compact tokens and sign-in surface

#### Automated

- [x] 1.1 Lint and production build pass with the compact warm token layer and sign-in shell — a4ddb34

#### Manual

- [x] 1.2 Desktop and mobile sign-in screenshots show the intended warm visual hierarchy — a4ddb34
- [x] 1.3 Sign-in form action and sign-up link retain their existing destinations — a4ddb34

### Phase 2: Token-driven form states

#### Automated

- [x] 2.1 Lint and production build pass with token-driven shared auth controls — a4ddb34

#### Manual

- [x] 2.2 Validation and server errors use the destructive token — a4ddb34
- [x] 2.3 Keyboard focus is visible and the screen remains readable at desktop and mobile widths — a4ddb34
- [ ] 2.4 Existing pending submit state remains to be exercised against a configured authentication service
