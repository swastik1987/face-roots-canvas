# FaceRoots — Risk Register & Bias Audit

> **Status:** Phase 6 scaffold — updated as bias testing progresses.
> **Owner:** Swastik
> **Last reviewed:** 2026-04-13

---

## 1. Purpose

This document records known risks, mitigation strategies, and bias audit results for FaceRoots. It is a living document — update whenever model versions change, new feature types are added, or audit results are available.

---

## 2. What the app does (and does not do)

FaceRoots measures **visual similarity between facial features** using computer vision embeddings (InsightFace ArcFace + DINOv2 ViT-S/14). It does **not**:

- Perform DNA analysis or genetic testing.
- Infer ethnicity, ancestry, health status, or identity.
- Establish biological parentage.

All copy and LLM narration enforces these limits (see CLAUDE.md §9).

---

## 3. Known risks

| ID | Risk | Severity | Mitigation | Status |
|----|------|----------|------------|--------|
| R-01 | Users may interpret visual similarity scores as genetic proof | High | "Not a genetic test" disclaimer on every result screen, share card, and narration fallback | Implemented |
| R-02 | LLM narration contains prohibited categories (ethnicity, attractiveness, etc.) | High | Locked system prompt (§9.1) + deny-list post-filter (§9.3) | Implemented |
| R-03 | Feature matching performs unequally across demographic groups (embedding bias) | High | Bias audit in progress — see §5 below | Pending |
| R-04 | Biometric face data leaked via storage misconfiguration | High | Private S3 buckets, RLS on all tables, signed URLs ≤15 min expiry | Implemented |
| R-05 | NSFW images bypass client-side checks | Medium | Server-side `validate-face` runs independent NSFW classifier | Implemented |
| R-06 | User under 18 completes flow | Medium | 18+ self-attestation on sign-up; no minor-specific consent flow in v1 | Partial — legal review pending |
| R-07 | Rate limits circumvented via multiple accounts | Low | Per-user-ID limit; IP-hash logging for pattern detection | Implemented |
| R-08 | InsightFace / DINOv2 model version drift breaks embedding comparisons | Medium | `model_versions` stamped on every `analyses` row | Implemented |
| R-09 | "Family DNA Map" branding implies genetics | Medium | Tagline is "Fun resemblance analysis"; legal copy reviewed | Implemented |

---

## 4. Model version tracking

Every `analyses` row records the exact model versions used at time of analysis. Current defaults:

```json
{
  "face":     "buffalo_l@2024-02",
  "features": "dinov2-vits14@2024-01",
  "llm":      "gemini-2.5-flash@2025-02"
}
```

If any model is upgraded, existing results remain interpretable because the version is stamped. Cross-version comparison is disabled (future work: re-embed on version bump).

---

## 5. Bias audit plan

### 5.1 Methodology

Run 10 varied test face sets (2 adults per set, diverse demographic representation) and compute:

- Mean cosine similarity per feature type across all pairs.
- Standard deviation — wide SD indicates inconsistent feature coverage.
- False-positive rate: same-family pairs with similarity < 50%.
- False-negative rate: unrelated pairs with similarity > 80%.

Target: SD < 0.12 per feature type; FP/FN rates below 5%.

### 5.2 Feature coverage gaps (preliminary)

Based on model documentation and similar projects:

| Feature | Known gap | Risk |
|---------|-----------|------|
| `hairline` | ArcFace focuses on inner face; hairline landmarks approximate | Medium |
| `ear_left` / `ear_right` | Only captured on profile shots; many uploads are front-only | Medium |
| `face_shape` | Convex hull approximation; sensitive to head tilt | Low |
| `eyes_*` | Well-covered by ArcFace — highest confidence expected | Low |
| `nose` | Well-covered | Low |

### 5.3 Audit results

> **TODO:** Run 10 test face sets and document results here once the embedding pipeline is live.

| Test set | Demographic | Mean similarity | SD | Notes |
|----------|-------------|-----------------|-----|-------|
| TBD | — | — | — | — |

### 5.4 Actions pending

- [ ] Execute 10-set bias audit with real embeddings.
- [ ] Document results in §5.3.
- [ ] Add alerting if any feature type's mean similarity deviates > 2σ from baseline.
- [ ] Commission independent bias review before public launch.

---

## 6. Privacy & compliance

| Regulation | Requirement | Status |
|------------|-------------|--------|
| India DPDP Act | Consent before processing biometric data | Implemented — consent_events table |
| GDPR (if EU users) | Right to erasure | Implemented — delete-my-data Edge Function |
| GDPR | Data minimisation | Implemented — 7-day TTL on raw images by default |
| GDPR | Data breach notification | Sentry alerting configured; incident runbook TBD |
| General | No raw IP storage | Implemented — IP stored as daily-salted SHA-256 hash |

---

## 7. Incident response

If a security or privacy incident occurs:

1. Immediately disable the affected feature flag in PostHog.
2. Revoke affected storage bucket access via Supabase dashboard.
3. Notify affected users within 72 hours (GDPR requirement).
4. Run `delete-my-data` for affected user IDs if data was exposed.
5. File incident in this document with date, scope, and resolution.

---

## 8. Change log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-13 | Claude (Phase 6) | Initial scaffold created |
