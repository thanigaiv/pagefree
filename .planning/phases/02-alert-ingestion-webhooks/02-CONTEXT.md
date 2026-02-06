# Phase 2: Alert Ingestion & Webhooks - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

System receives alerts from external monitoring tools via webhook API, validates authenticity through signature verification, processes webhooks idempotently to prevent duplicate alerts, and stores both raw and normalized alert data reliably. Routing, escalation, and notifications are handled in later phases.

</domain>

<decisions>
## Implementation Decisions

### Webhook security
- Signature validation required for all webhooks (no unsigned webhooks accepted)
- Per-integration webhook secrets (each monitoring tool integration has own secret)
- HMAC signature algorithm: Claude's discretion (research monitoring tool ecosystem)
- IP allowlisting: Claude's discretion (evaluate security vs operational complexity trade-offs)

### Idempotency strategy
- Hybrid duplicate detection: use external idempotency key if provided, fall back to content fingerprinting
- Return 200 with existing alert ID for duplicate webhooks (idempotent behavior)
- Deduplication window configurable per integration (different monitoring tools have different retry patterns)
- Track full webhook delivery attempt log (every attempt with timestamp for debugging)

### Alert data handling
- Store raw webhook payload + normalized schema (preserve original for audit, extract for processing)
- Unknown fields stored in raw payload only (ignore in normalization, preserve in JSON)
- Always normalize timestamps to UTC ISO-8601 on ingestion (prevent timezone bugs)
- Schema validation strictness: Claude's discretion (balance reliability vs flexibility based on monitoring tool variance)

### Error responses
- Detailed field-level validation errors (help integration debugging)
- Standard REST status codes (400 validation, 401 auth, 409 duplicate, 500 server error)
- Retry-After header for rate limits and temporary failures
- RFC 7807 Problem Details format: {type, title, status, detail, instance}

### Claude's Discretion
- HMAC algorithm choice (research DataDog, New Relic, other monitoring tools)
- IP allowlisting implementation decision (security benefit vs cloud service brittleness)
- Schema validation strictness (required fields vs flexible extraction)

</decisions>

<specifics>
## Specific Ideas

- Signature validation is non-negotiable - all webhooks must be authenticated
- Idempotency is critical per roadmap research (Phase 2 pitfall: "webhook idempotency essential")
- Timestamps must follow Phase 1 UTC storage pattern (blockers/concerns: prevent timezone bugs)
- Error responses should help legitimate integrators debug, not attackers probe

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 02-alert-ingestion-webhooks*
*Context gathered: 2026-02-06*
