# Payment Pro Design

## Overview

License key system for Azu Pro ($5/month or $48/year). Stripe Checkout for purchase, Cloudflare Worker generates Ed25519-signed license keys, Azu validates offline. No server needed after key generation.

## License Key Format

```
AZU-PRO-{base64_payload}.{base64_signature}
```

Payload: `{"email":"user@example.com","plan":"monthly","issued":1712800000,"expires":1715392000}`

Signed with Ed25519 private key (Worker). Verified with public key embedded in app binary.

## Purchase Flow

1. User clicks "Buy Pro" (landing page or in-app button)
2. Redirects to Stripe Checkout (monthly $5 or yearly $48)
3. On payment: Stripe webhook hits Cloudflare Worker
4. Worker generates signed license key
5. Key shown on success page + sent via email (Resend API)
6. User pastes key in Azu → validates offline → Pro unlocked

## Backend Azu

### `src-tauri/src/license/mod.rs`

Module exports.

### `src-tauri/src/license/license.rs`

Types:
- `LicenseInfo` { email, plan, issued, expires } (Serialize + Deserialize)
- `LicenseStatus` { valid, info (Option), expired, days_remaining }

Functions:
- `validate_key(key: &str) -> Result<LicenseInfo, String>` — parse key format, base64-decode payload + signature, verify Ed25519 signature against embedded public key, check expiry
- `load_license() -> Option<String>` — read `~/.azu/license.key`
- `save_license(key: &str) -> Result<(), String>` — write to `~/.azu/license.key`
- `remove_license() -> Result<(), String>` — delete file
- `is_pro_active() -> bool` — load + validate + check expiry

Public key: hardcoded `const PUB_KEY: &str = "..."` in the source.

### `src-tauri/src/commands/license.rs`

3 Tauri commands:
- `activate_license(key: String)` — validate + save, return LicenseStatus
- `get_license_status()` — load + validate, return LicenseStatus
- `deactivate_license()` — remove file

### Registration

- `mod license` in `lib.rs`
- 3 commands registered in invoke_handler

## Frontend Azu

### `src/stores/license.ts`

- `proEnabled` signal (computed from license validation)
- `licenseInfo` signal
- `checkLicense()` — called on app init, sets proEnabled
- `activateLicense(key)` — calls command, updates signals
- `deactivateLicense()` — calls command, resets signals

### `src/stores/pipeline.ts` (modified)

Replace the hardcoded `proEnabled = true` with import from license store.

### `src/components/Settings/LicensePanel.tsx` (new)

Modal/panel accessed from TitleBar:
- Shows current license status (active/expired/none)
- Text input for license key + "Activate" button
- "Deactivate" button when active
- "Buy Pro" button that opens Stripe Checkout URL in system browser
- Error display for invalid keys

### `src/components/TitleBar/TitleBar.tsx` (modified)

- When not Pro: show "Pro" button that opens LicensePanel
- When Pro: show small "PRO" badge

## Cloudflare Worker

### `worker/src/index.ts`

Two endpoints:

**`POST /webhook`** — Stripe webhook handler:
- Verify Stripe signature
- On `checkout.session.completed`: extract email, plan from metadata
- Generate license key: create payload JSON, sign with Ed25519 private key, format as `AZU-PRO-{b64payload}.{b64sig}`
- Store key in KV (keyed by session_id) for success page retrieval
- Send email with key via Resend API

**`GET /success?session_id=xxx`** — Success page:
- Look up key from KV by session_id
- Render simple HTML page showing the license key with copy button

### Worker Secrets
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
- `STRIPE_SECRET_KEY` — for session retrieval
- `ED25519_PRIVATE_KEY` — license key signing
- `RESEND_API_KEY` — email sending

### Worker KV
- `LICENSE_KEYS` namespace — stores generated keys by session_id (TTL 24h)

## Stripe Configuration

- Product: "Azu Pro"
- Price 1: $5/month recurring
- Price 2: $48/year recurring
- Checkout success_url: `https://azu-worker.{account}.workers.dev/success?session_id={CHECKOUT_SESSION_ID}`
- Webhook endpoint: `https://azu-worker.{account}.workers.dev/webhook`
- Webhook events: `checkout.session.completed`

## Dependencies

### Rust
- `ed25519-dalek = "2"` — Ed25519 signature verification

### Worker (npm)
- `stripe` — Stripe SDK
- `tweetnacl` or `@noble/ed25519` — Ed25519 signing

## Error Handling

- Invalid key format: "Invalid license key format"
- Bad signature: "License key signature invalid"
- Expired: show expiry date, prompt renewal
- Network errors on webhook: Stripe retries automatically
- Email send failure: key still shown on success page (email is backup)

## Out of Scope

- Subscription management (cancel/upgrade) — handled by Stripe portal
- Refunds — handled manually via Stripe dashboard
- Team/org licenses
- Offline grace period (key must be valid, no grace)
