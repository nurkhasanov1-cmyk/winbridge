# GitHub Setup

The public GitHub remote is:

```text
https://github.com/nurkhasanov1-cmyk/winbridge.git
```

Local verification before pushing:

```powershell
npm run verify
```

## Initial GitHub Project Setup

- Confirm Actions are enabled.
- Add branch protection for `main`.
- Require CI before merge.
- Enable private vulnerability reporting if available.
- Create labels:
  - `area:protocol`
  - `area:relay`
  - `area:windows`
  - `area:security`
  - `area:openspec`
  - `type:bug`
  - `type:feature`
  - `type:security`

## Suggested Initial Issues

1. Define identity and device pairing model.
2. Design host consent and visible session UX.
3. Choose Windows native stack.
4. Add WebRTC signaling and media transport.
5. Add audit persistence.
6. Add Windows capture adapter.
7. Add Windows input adapter with revocation tests.
