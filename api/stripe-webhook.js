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
 *   RESEND_API_KEY         — re_... (from resend.com) — used for all admin alert emails
 *
 * Stripe events to enable in Dashboard:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.payment_failed
 */

import Stripe from 'stripe';
import { alertOnAbuse } from './_alert.js';

// Webhooks must receive the raw body — disable body parsing
export const config = { api: { bodyParser: false } };

// ── Idempotency guard — prevents duplicate processing on Stripe retries ───────
// Stores the last 1,000 processed event IDs in memory.
const processedEvents = new Set();
function markProcessed(eventId) {
  processedEvents.add(eventId);
  if (processedEvents.size > 1000) {
    // Remove oldest entries (Sets maintain insertion order)
    const toDelete = [...processedEvents].slice(0, 200);
    toDelete.forEach(id => processedEvents.delete(id));
  }
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Admin email alert via Resend ─────────────────────────────────────────────
// Sends a transactional email via Resend so Evan gets an alert for critical events.
// Requires RESEND_API_KEY env var in Vercel.
// 'from' uses resend.dev until 1ststep.ai domain is verified in Resend.
async function sendAdminAlert(subject, message, replyTo = '') {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log('RESEND_API_KEY not set — skipping admin alert');
    return;
  }
  try {
    // Convert plain-text message to simple HTML (preserve line breaks)
    const htmlBody = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    const payload = {
      from:    process.env.RESEND_FROM || 'onboarding@resend.dev',
      to:      'evan@1ststep.ai',
      subject,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
               <h2 style="margin:0 0 16px;color:#0F172A">${subject}</h2>
               <p style="color:#374151;line-height:1.6;font-size:14px">${htmlBody}</p>
               <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0">
               <p style="font-size:12px;color:#9CA3AF">1stStep.ai automated alert — do not reply to this address.</p>
             </div>`,
    };
    if (replyTo) payload.reply_to = replyTo;

    const r = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (r.ok) {
      console.log(`✅ Admin alert sent via Resend: ${data.id}`);
    } else {
      console.error('Resend admin alert error:', JSON.stringify(data));
    }
  } catch (err) {
    console.error('Admin alert send failed:', err.message);
  }
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
      method: 'POST',
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

  // 2. Move/create opportunity in the correct Converted stage
  const pipelineId = process.env.GHL_PIPELINE_ID;
  if (!pipelineId || !contactId) return;

  // Pick stage based on tier
  const stageId = tier === 'complete'
    ? process.env.GHL_STAGE_CONVERTED_COMPLETE
    : process.env.GHL_STAGE_CONVERTED_ESSENTIAL;

  try {
    // Check if they already have an opportunity (came through beta)
    const searchRes = await fetch(
      `https://services.leadconnectorhq.com/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&contact_id=${contactId}`,
      { headers }
    );
    const searchData = searchRes.ok ? await searchRes.json() : {};
    const existingOpp = searchData?.opportunities?.[0];

    if (existingOpp?.id) {
      // Move existing opportunity to Converted stage
      const updateBody = { status: 'won' };
      if (stageId) updateBody.pipelineStageId = stageId;
      await fetch(`https://services.leadconnectorhq.com/opportunities/${existingOpp.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateBody),
      });
      console.log(`✅ GHL opportunity moved to Converted (${tierLabel}): ${existingOpp.id}`);
    } else {
      // Create new opportunity directly in Converted stage
      const oppBody = {
        pipelineId,
        locationId,
        contactId,
        name:   `${name || email} — ${tierLabel}`,
        status: 'won',
      };
      if (stageId) oppBody.pipelineStageId = stageId;
      const r = await fetch('https://services.leadconnectorhq.com/opportunities/', {
        method: 'POST',
        headers,
        body: JSON.stringify(oppBody),
      });
      const data = await r.json();
      const oppId = data.opportunity?.id;
      if (oppId) {
        console.log(`✅ GHL opportunity created in Converted (${tierLabel}): ${oppId}`);
      } else {
        console.error('GHL opportunity creation failed:', JSON.stringify(data));
      }
    }
  } catch (err) {
    console.error('GHL opportunity error:', err.message);
  }
}

// ── GHL tag update on cancellation / payment failure ─────────────────────────
// Looks up the contact by Stripe customer ID email and updates their tags.
async function updateGHLOnChurn({ customerId, stripe, event }) {
  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId) return;

  // Resolve email from customer ID
  let email = '';
  try {
    const customer = await stripe.customers.retrieve(customerId);
    email = customer.email || '';
  } catch (err) {
    console.error('Could not retrieve customer for GHL update:', err.message);
    return;
  }
  if (!email) return;

  const isPaymentFailed = event === 'payment_failed';
  const tags = isPaymentFailed
    ? ['payment_failed']
    : ['churned', 'cancelled'];

  try {
    const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version':       '2021-07-28',
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ locationId, email, tags }),
    });
    const data = await r.json();
    if (data.contact?.id) {
      console.log(`✅ GHL contact updated (${event}): ${data.contact.id} (${email})`);
    } else {
      console.error('GHL churn update returned no ID:', JSON.stringify(data));
    }
  } catch (err) {
    console.error('GHL churn update error:', err.message);
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
    alertOnAbuse('webhook_sig_failure', req.headers['x-real-ip'] || 'unknown', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // ── Idempotency check — ignore duplicate deliveries ────────────────────────
  if (processedEvents.has(event.id)) {
    console.log(`Duplicate webhook event ignored: ${event.id}`);
    return res.status(200).json({ received: true, duplicate: true });
  }
  markProcessed(event.id);

  // ── Handle events ──────────────────────────────────────────────────────────
  switch (event.type) {

    case 'checkout.session.completed': {
      const session      = event.data.object;
      const email        = session.customer_details?.email || session.customer_email || '';
      const name         = session.customer_details?.name  || '';
      const amountPaid   = session.amount_total ? `$${(session.amount_total / 100).toFixed(2)}` : 'unknown';
      console.log(`✅ Checkout complete — email: ${email}`);

      const tier      = await getTierFromSession(stripe, session.id);
      const tierLabel = tier === 'complete' ? 'Complete' : 'Essential';
      console.log(`   Tier: ${tier}`);

      // Sync to GHL CRM
      await pushToGHL({ email, name, tier });

      // Notify Evan — reply-to set so he can follow up directly
      await sendAdminAlert(
        `💰 New subscriber — ${tierLabel} plan`,
        `Name:   ${name || '(not provided)'}\nEmail:  ${email}\nPlan:   ${tierLabel}\nAmount: ${amountPaid}\nTime:   ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}\n\nContact has been added to GHL automatically.`,
        email,
      );
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      console.log(`🔄 Subscription updated — id: ${sub.id}, status: ${sub.status}`);
      // Alert if subscription moves to a non-active state (past_due, unpaid, etc.)
      if (!['active', 'trialing'].includes(sub.status)) {
        await sendAdminAlert(
          `⚠️ Subscription status changed: ${sub.status}`,
          `Subscription ID: ${sub.id}\nCustomer: ${sub.customer}\nStatus: ${sub.status}\nCheck Stripe for details.`
        );
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      console.log(`❌ Subscription cancelled — id: ${sub.id}`);
      // Update GHL — mark contact as churned
      await updateGHLOnChurn({ customerId: sub.customer, stripe, event: 'cancelled' });
      // Alert Evan
      await sendAdminAlert(
        `❌ Subscription cancelled`,
        `Subscription ID: ${sub.id}\nCustomer ID: ${sub.customer}\nCancelled at: ${new Date().toLocaleString()}\n\nCheck Stripe and reach out to win them back.`
      );
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const amountDollars = (invoice.amount_due / 100).toFixed(2);
      console.log(`⚠️  Payment failed — customer: ${invoice.customer}, amount: $${amountDollars}`);
      // Update GHL — tag contact as payment_failed
      await updateGHLOnChurn({ customerId: invoice.customer, stripe, event: 'payment_failed' });
      // Alert Evan
      await sendAdminAlert(
        `⚠️ Payment failed — $${amountDollars}`,
        `Customer ID: ${invoice.customer}\nInvoice ID: ${invoice.id}\nAmount due: $${amountDollars}\nAttempt: ${invoice.attempt_count}\n\nStripe will retry automatically. Consider reaching out.`
      );
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return res.status(200).json({ received: true });
}
