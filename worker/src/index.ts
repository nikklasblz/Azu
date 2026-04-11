import * as ed from '@noble/ed25519'
import Stripe from 'stripe'

export interface Env {
  // KV namespace for storing license keys temporarily
  LICENSE_KEYS: KVNamespace

  // Secrets — set via: wrangler secret put <NAME>
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  ED25519_PRIVATE_KEY: string // base64 DER PKCS8
  RESEND_API_KEY: string

  // Vars from wrangler.toml
  STRIPE_CHECKOUT_MONTHLY_URL: string
  STRIPE_CHECKOUT_YEARLY_URL: string
}

// ---------------------------------------------------------------------------
// Ed25519 signing
// ---------------------------------------------------------------------------

async function signPayload(payload: string, privateKeyBase64: string): Promise<string> {
  const pkcs8 = Uint8Array.from(atob(privateKeyBase64), (c) => c.charCodeAt(0))
  // PKCS8 Ed25519: raw 32-byte seed starts at byte 16
  const seed = pkcs8.slice(16, 48)
  const signature = await ed.signAsync(new TextEncoder().encode(payload), seed)
  return btoa(String.fromCharCode(...signature))
}

// ---------------------------------------------------------------------------
// License key generation
// ---------------------------------------------------------------------------

type Plan = 'monthly' | 'yearly'

async function generateLicenseKey(
  email: string,
  plan: Plan,
  privateKeyBase64: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const daysToAdd = plan === 'yearly' ? 366 : 31
  const expires = now + daysToAdd * 24 * 60 * 60

  const payloadObj = { email, plan, issued: now, expires }
  const payloadJson = JSON.stringify(payloadObj)
  const b64Payload = btoa(payloadJson)
  const b64Sig = await signPayload(payloadJson, privateKeyBase64)

  return `AZU-PRO-${b64Payload}.${b64Sig}`
}

// ---------------------------------------------------------------------------
// Email via Resend
// ---------------------------------------------------------------------------

async function sendLicenseEmail(email: string, key: string, apiKey: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Azu <license@azu.dev>',
      to: email,
      subject: 'Your Azu Pro License Key',
      html: `
        <h2>Welcome to Azu Pro!</h2>
        <p>Thank you for your purchase. Your license key is below:</p>
        <pre style="background:#1a1a2e;color:#58a6ff;padding:16px;border-radius:8px;font-size:14px;word-break:break-all">${key}</pre>
        <p>To activate Pro features, open Azu and go to <strong>Settings → License</strong>, then paste the key above.</p>
        <p>If you have any issues, reply to this email and we'll help you out.</p>
      `,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`Resend error ${response.status}: ${body}`)
  }
}

// ---------------------------------------------------------------------------
// Success page HTML
// ---------------------------------------------------------------------------

function successPageHtml(key: string | null): string {
  if (!key) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Azu Pro — Processing</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d0d1a;
      color: #e0e0ff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1a1a2e;
      border: 1px solid #2a2a4a;
      border-radius: 16px;
      padding: 48px;
      max-width: 560px;
      width: 100%;
      text-align: center;
    }
    h1 { font-size: 28px; color: #58a6ff; margin-bottom: 16px; }
    p { font-size: 16px; line-height: 1.6; color: #a0a0cc; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Processing Your License</h1>
    <p>Your license key is being generated. Please check your email in a few minutes — it will arrive at the address you used during checkout.</p>
    <p style="margin-top:16px;">If you don't receive it within 10 minutes, contact us at <a href="mailto:support@azu.dev" style="color:#58a6ff;">support@azu.dev</a>.</p>
  </div>
</body>
</html>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Azu Pro — License Key</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d0d1a;
      color: #e0e0ff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1a1a2e;
      border: 1px solid #2a2a4a;
      border-radius: 16px;
      padding: 48px;
      max-width: 600px;
      width: 100%;
    }
    h1 { font-size: 32px; color: #58a6ff; margin-bottom: 8px; }
    .subtitle { font-size: 16px; color: #a0a0cc; margin-bottom: 32px; }
    .key-label {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #6a6a9a;
      margin-bottom: 8px;
    }
    .key-block {
      position: relative;
      background: #0d0d1a;
      border: 1px solid #2a2a4a;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 12px;
    }
    pre {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
      color: #58a6ff;
      word-break: break-all;
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .copy-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #58a6ff;
      color: #0d0d1a;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-bottom: 24px;
    }
    .copy-btn:hover { background: #79b8ff; }
    .copy-btn.copied { background: #3fb950; color: #fff; }
    .instructions {
      background: #111128;
      border: 1px solid #2a2a4a;
      border-radius: 10px;
      padding: 20px 24px;
    }
    .instructions h3 { font-size: 14px; color: #e0e0ff; margin-bottom: 12px; }
    .instructions ol { padding-left: 20px; }
    .instructions li {
      font-size: 14px;
      color: #a0a0cc;
      line-height: 1.7;
    }
    .instructions code {
      background: #1a1a2e;
      border-radius: 4px;
      padding: 2px 6px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: #58a6ff;
    }
    .note {
      margin-top: 20px;
      font-size: 13px;
      color: #6a6a9a;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Thank you!</h1>
    <p class="subtitle">Your Azu Pro license key is ready. A copy has also been sent to your email.</p>

    <p class="key-label">Your License Key</p>
    <div class="key-block">
      <pre id="licenseKey">${key}</pre>
    </div>

    <button class="copy-btn" id="copyBtn" onclick="copyKey()">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
        <path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      Copy Key
    </button>

    <div class="instructions">
      <h3>Activate your license</h3>
      <ol>
        <li>Open the <strong>Azu</strong> terminal application</li>
        <li>Go to <code>Settings</code> → <code>License</code></li>
        <li>Paste the key above and click <strong>Activate</strong></li>
      </ol>
    </div>

    <p class="note">Keep this key safe — you can always retrieve it from your email.</p>
  </div>

  <script>
    function copyKey() {
      const key = document.getElementById('licenseKey').textContent
      const btn = document.getElementById('copyBtn')
      navigator.clipboard.writeText(key).then(() => {
        btn.classList.add('copied')
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!'
        setTimeout(() => {
          btn.classList.remove('copied')
          btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Copy Key'
        }, 2500)
      })
    }
  </script>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const body = await request.text()

  let event: Stripe.Event
  try {
    // Stripe webhook verification requires the raw body as a string
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
    event = await stripe.webhooks.constructEventAsync(body, sig, env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    // Acknowledge but ignore other event types
    return new Response('OK', { status: 200 })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const email = session.customer_details?.email ?? session.customer_email
  const plan = (session.metadata?.plan ?? 'monthly') as Plan

  if (!email) {
    console.error('No customer email in session:', session.id)
    return new Response('Missing customer email', { status: 422 })
  }

  let licenseKey: string
  try {
    licenseKey = await generateLicenseKey(email, plan, env.ED25519_PRIVATE_KEY)
  } catch (err) {
    console.error('License generation failed:', err)
    return new Response('License generation error', { status: 500 })
  }

  // Store in KV keyed by session ID, TTL 24 h so the success page can show it
  await env.LICENSE_KEYS.put(session.id, licenseKey, { expirationTtl: 86400 })

  // Fire-and-forget email (don't fail the webhook if email fails)
  env.RESEND_API_KEY && sendLicenseEmail(email, licenseKey, env.RESEND_API_KEY).catch(console.error)

  return new Response('OK', { status: 200 })
}

async function handleSuccess(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get('session_id')

  let key: string | null = null
  if (sessionId) {
    key = await env.LICENSE_KEYS.get(sessionId)
  }

  return new Response(successPageHtml(key), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    if (pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env)
    }

    if (pathname === '/success' && request.method === 'GET') {
      return handleSuccess(request, env)
    }

    if (pathname === '/' && request.method === 'GET') {
      // Redirect to Azu landing page
      return Response.redirect('https://azu.dev', 302)
    }

    return new Response('Not Found', { status: 404 })
  },
}
