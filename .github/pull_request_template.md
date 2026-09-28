## Problem and change

Describe the concrete problem and resulting behavior. Link a related issue if applicable.

## Validation

State the checks run and results, plus anything not tested. For native acceptance, include the exact source/client versions and sanitized evidence; distinguish synthetic tests from real calls.

## Checklist

- [ ] The change is focused and affected documentation is updated.
- [ ] Relevant tests pass (`npm run verify`); confirmed defects have regression coverage.
- [ ] Model/provider/auth/service-tier and approval/sandbox boundaries are preserved.
- [ ] No credentials, raw logs, `.cae`, local captures or private task histories are included.
