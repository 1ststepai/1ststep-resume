/**
 * POST /api/stripe-webhook
 *
 * Handles Stripe subscription lifecycle events.
 * On checkout.session.completed → upserts contact + creates opportunity in GHL.
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY      — sk_live_...
 *   STRIPE_WEBHOOK_SECRET  — whsec_... (from Stripe Dashboard → Webhooks)
 *   GHL_API_KEY            — pit-... (GoHighLevel Private Integration Token)
 *   GHL_LOCATION_ID        — GHL Location ID
 *   GHL_PIPELINE_ID        — (optional) GHL Pipeline ID — add after creating pipeline in GHL
 *
 * Stripe events to enable in Dashboard:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.payment_failed
 */

import Stripe from 'stripe';

// Webhooks must receive the raw body — disable body parsing
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── GHL helpers ──────────────────────────────────────────────────────────────

async function pushToGHL({ email, name, tier }) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) {
    console.log('GHL env vars not configured — skipping CRM sync');
    return;
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-07-28',
    'Content-Type':  'application/json',
  };

  const nameParts = (name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';
  const tierLabel = tier === 'complete' ? 'Complete' : 'Essential';

  // 1. Upsert contact (create or update by email)
  let contactId;
  try {
    const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        locationId,
        email,
        firstName,
        lastName,
        tags:   ['paid', tier],
        source: `1stStep.ai — ${tierLabel}`,
      }),
    });
    const data = await r.json();
    contactId = data.contact?.id;
    if (contactId) {
      console.log(`✅ GHL contact upserted: ${contactId} (${email})`);
    } else {
      console.error('GHL contact upsert returned no ID:', JSON.stringify(data));
    }
  } catch (err) {
    console.error('GHL contact upsert error:', err.message);
    return;
  }

  // 2. Create opportunity in pipeline (only if GHL_PIPELINE_ID is set)
  const pipelineId = process.env.GHL_PIPELINE_ID;
  if (!pipelineId || !contactId) return;

  try {
    const r = await fetch('https://services.leadconnectorhq.com/opportunities/', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pipelineId,
        locationId,
        contactId,
        name:   `${name || email} — ${tierLabel}`,
        status: 'open',
      }),
    });
    const data = await r.json();
    const oppId = data.opportunity?.id;
    if (oppId) {
      console.log(`✅ GHL opportunity created: ${oppId}`);
    } else {
      console.error('GHL opportunity creation failed:', JSON.stringify(data));
    }
  } catch (err) {
    console.error('GHL opportunity creation error:', err.message);
  }
}

// ── Stripe tier detection ────────────────────────────────────────────────────

async function getTierFromSession(stripe, sessionId) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items.data.price.product'],
    });
    const productName = session.line_items?.data?.[0]?.price?.product?.name || '';
    return productName.toLowerCase().includes('complete') ? 'complete' : 'essential';
  } catch (err) {
    console.error('Could not determine tier from session:', err.message);
    return 'essential'; // safe default
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe env vars missing');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // ── Handle events ──────────────────────────────────────────────────────────
  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object;
      const email   = session.customer_details?.email || session.customer_email || '';
      const name    = session.customer_details?.name  || '';
      console.log(`✅ Checkout complete — email: ${email}`);

      const tier = await getTierFromSession(stripe, session.id);
      console.log(`   Tier: ${tier}`);

      await pushToGHL({ email, name, tier });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      console.log(`🔄 Subscription updated — id: ${sub.id}, status: ${sub.status}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      console.log(`❌ Subscription cancelled — id: ${sub.id}`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.log(`⚠️  Payment failed — customer: ${invoice.customer}, amount: ${invoice.amount_due}`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return res.status(200).json({ received: true });
}
