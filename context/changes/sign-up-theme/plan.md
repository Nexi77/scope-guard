# Warm Sign-up Theme Implementation Plan

## Overview

Bring the existing sign-up page into the warm semantic visual system already used by sign-in, without changing registration behavior.

## Phase 1: Sign-up surface and helper text

### Changes Required

#### 1. Sign-up page shell

**File**: `src/pages/auth/signup.astro`

**Intent**: Replace the cosmic glass shell with the established semantic card and account-link hierarchy.

**Contract**: Keep the route, `SignUpForm`, server-error input, sign-in link, and centered responsive layout. Use no raw palette literals.

#### 2. Password-length hint

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Make the validation helper text use the existing muted semantic role.

**Contract**: Preserve the password validation condition and copy exactly.

### Success Criteria

#### Automated Verification

- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification

- The desktop and mobile sign-up screen use the warm card and amber primary CTA.
- Empty submission exposes all three field errors without overflowing the mobile card.
- The visible focus ring reaches both password controls, submit, and sign-in link.

## References

- `context/changes/sign-in-theme/theme-values.css`
- `src/styles/global.css:6-110`
- `src/components/auth/FormField.tsx:5-65`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Sign-up surface and helper text

#### Automated

- [x] 1.1 Lint and production build pass with the tokenized sign-up surface

#### Manual

- [x] 1.2 Desktop and mobile sign-up screenshots show the warm visual hierarchy
- [x] 1.3 Empty submission exposes all field errors without mobile overflow
- [x] 1.4 Keyboard focus is visible on password controls, submit, and sign-in link
