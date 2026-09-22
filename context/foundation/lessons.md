# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Run Supabase CLI commands outside the sandbox

- **Context**: whole ScopeGuard repository
- **Problem**: You stumble upon an error and need to run the same command with correct permissions, which wastes tokens.
- **Rule**: Run Supabase CLI commands with outside-sandbox permission, requesting user approval first.
- **Applies to**: all
