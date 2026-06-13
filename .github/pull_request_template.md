## Summary

-

## OpenSpec

- Change id:
- Specs updated:
- Tasks completed:

## Risk Scope / Review Gate

- [ ] No high-risk surfaces are touched.
- [ ] High-risk surfaces are touched: capture, input, authentication, authorization, relay routing, tokens, logging/audit, installer behavior, startup behavior, privilege elevation, background services, or native Windows APIs.
- Security review link:

## Safety Checklist

- [ ] Host consent remains explicit.
- [ ] Active sessions remain visible to the host.
- [ ] Host revoke/disconnect path still works.
- [ ] Sensitive actions are permission-scoped.
- [ ] Security-relevant actions emit audit events.
- [ ] No hidden session, stealth persistence, credential theft, keylogging, AV/EDR evasion, or Windows prompt bypass was added.

## Release Documentation

- [ ] Release readiness impact reviewed against `docs/release-checklist.md`.
- [ ] Privacy/data-handling impact reviewed against `docs/privacy-notice.md`.
- [ ] User-facing docs updated when consent, visibility, auth, audit, data handling, installer/startup/service behavior, or known non-capabilities changed.

## Verification

- [ ] `npm run verify`
- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run openspec:validate`
