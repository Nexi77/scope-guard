# Research: Warm sign-up theme

## Charge list

1. **Missing token adoption** — `src/pages/auth/signup.astro:9-18` uses `bg-cosmic`, glass/white colors, a blue-to-purple heading, and purple link styling instead of the semantic roles in `src/styles/global.css:6-110`. Users see a different visual language when creating an account than when returning to sign in.
2. **Missing token adoption** — `src/components/auth/SignUpForm.tsx:57-63` uses a blue literal for the password-length hint. Its supporting information does not inherit the newly established muted text role.
3. **Accidental architecture check** — `src/pages/auth/signup.astro:14` passes the server error into the existing form and the form retains its `/api/auth/signup` action at `src/components/auth/SignUpForm.tsx:66`. Direct entry remains a browser form, not a raw API response; no entry-point change is needed.

## Contract

- Values remain in `src/styles/global.css`, the semantic source already introduced by `context/changes/sign-in-theme/theme-values.css`.
- Reuse `FormField`, `SubmitButton`, `PasswordToggle`, and `ServerError`; they already provide the token-driven default, focus, disabled, error, and loading presentations.
- Scope is one view plus its view-specific password hint. The duplicated auth shell is deferred rather than extracted in this change.
