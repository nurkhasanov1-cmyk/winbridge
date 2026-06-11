## Context

WinBridge currently treats `signal` messages as bounded relay metadata and rejects empty, oversized, or obviously sensitive payload keys. Recent audit redaction work already recognizes additional auth/session secret key names such as API keys, authorization headers, cookies, and private keys. The protocol validation boundary should reject the same class of raw secret-bearing keys before a relay forwards a message.

## Goals / Non-Goals

**Goals:**

- Reject `signal` payload object keys that indicate raw auth/session secrets, including API keys, authorization/auth headers, cookies, and private keys.
- Keep the rejection recursive for nested objects and arrays.
- Preserve non-secret lifecycle identifiers such as `authorizationId`.
- Prove the behavior at the protocol boundary and relay integration boundary.
- Keep audit output secret-safe when relay rejection occurs.

**Non-Goals:**

- No content/value inspection of arbitrary signaling strings.
- No production identity, token lifecycle, account model, or relay authorization changes.
- No native Windows capture, input, installer, startup, service, persistence, or privilege-elevation behavior.
- No hidden session, credential collection, keylogging, prompt bypass, or evasion capability.

## Decisions

- Use normalized key-name validation. Keys are lowercased and stripped to alphanumeric characters before comparison, matching the existing protocol validation pattern and catching variants such as `rawAuthorizationHeader` or `private_key`.
- Separate exact sensitive names from substring indicators. Exact matching allows `authorization` to be rejected without treating `authorizationId` as a secret.
- Keep `authorizationId` as an explicit safe exact key. It is a lifecycle correlation identifier used throughout the authorization protocol and is not a raw credential.
- Reject at protocol parsing/encoding. `decodeProtocolEnvelope` and `encodeProtocolEnvelope` share schema validation, so the relay rejects unsafe `signal` messages before forwarding while agents also reject unsafe outbound messages.

## Risks / Trade-offs

- False positives from broad substring indicators can reject benign metadata names. Mitigation: keep the expanded list focused on common raw secret carriers and preserve known lifecycle identifiers explicitly.
- Value-based secrets with harmless key names can still pass. Mitigation: this change is a key-name safety boundary, not a data-loss-prevention engine; callers must not put raw secrets in signaling payload values.
- Rejecting more keys may break local experiments that used `signal` as an arbitrary transport. Mitigation: `signal` remains scoped to non-secret signaling metadata; sensitive auth/session data belongs in explicit protocol messages with consent, authorization, and audit semantics.
