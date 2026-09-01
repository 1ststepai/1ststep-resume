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
import {
  claimStripeWebhookEvent, completeStripeWebhookEvent, releaseStripeWebhookEvent,
  stripeWebhookIdempotencyConfiguration,
} from '../lib/stripe-webhook-idempotency.js';
import { recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';
import { sendConfiguredJobAgentOperatorAlert } from '../lib/job-agent-operator-alert.js';

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

// ── Admin email alert via Resend ─────────────────────────────────────────────
// Sends a transactional email via Resend so Evan gets an alert for critical events.
// Requires RESEND_API_KEY env var in Vercel.
// 'from' uses resend.dev until 1ststep.ai domain is verified in Resend.
async function sendAdminAlert(subject, message, replyTo = '', idempotencyKey = '') {
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
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (r.ok) {
      console.log(JSON.stringify({ type: 'admin-alert-delivery', outcome: 'sent' }));
    } else {
      console.error(JSON.stringify({ type: 'admin-alert-delivery-failed', status: r.status }));
    }
  } catch (err) {
    console.error(JSON.stringify({ type: 'admin-alert-delivery-error', name: err?.name || 'unknown' }));
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
  const tierLabel = 'Job Hunt Pass';

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
        tags:   ['paid', 'converted', 'job_hunt_pass', tier],
        source: `1stStep.ai — ${tierLabel}`,
      }),
    });
    const data = await r.json();
    contactId = data.contact?.id;
    if (contactId) {
      console.log('GHL billing contact captured.');
    } else {
      console.error(JSON.stringify({ type: 'ghl-billing-contact-missing-id' }));
    }
  } catch (err) {
    console.error(JSON.stringify({ type: 'ghl-billing-contact-upsert-error', name: err?.name || 'unknown' }));
    return;
  }

  // 2. Move/create opportunity in the correct Converted stage
  const pipelineId = process.env.GHL_PIPELINE_ID;
  if (!pipelineId || !contactId) return;

  // Pick stage based on tier
  const stageId = process.env.GHL_STAGE_CONVERTED_COMPLETE || process.env.GHL_STAGE_CONVERTED_ESSENTIAL;

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
      console.log(JSON.stringify({ type: 'ghl-opportunity-transition', outcome: 'moved' }));
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
        console.log(JSON.stringify({ type: 'ghl-opportunity-transition', outcome: 'created' }));
      } else {
        console.error(JSON.stringify({ type: 'ghl-opportunity-create-failed', status: r.status }));
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ type: 'ghl-opportunity-error', name: err?.name || 'unknown' }));
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
    console.error(JSON.stringify({ type: 'stripe-customer-retrieval-error', name: err?.name || 'unknown' }));
    return;
  }
  if (!email) return;

  const isPaymentFailed = event === 'payment_failed';
  const tags = isPaymentFailed
    ? ['payment_failed', 'churn_risk']
    : ['churned', 'cancelled', 'churn_risk'];

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
      console.log(JSON.stringify({ type: 'ghl-billing-contact-update', outcome: 'completed' }));
    } else {
      console.error(JSON.stringify({ type: 'ghl-churn-update-missing-id' }));
    }
  } catch (err) {
    console.error(JSON.stringify({ type: 'ghl-churn-update-error', name: err?.name || 'unknown' }));
  }
}

// ── Stripe tier detection ────────────────────────────────────────────────────

async function getTierFromSession(stripe, sessionId) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items.data.price.product'],
    });
    const productName = session.line_items?.data?.[0]?.price?.product?.name || '';
    const normalized = productName.toLowerCase();
    return (normalized.includes('job hunt pass') || normalized.includes('pro') || normalized.includes('complete') || normalized.includes('essential'))
      ? 'complete'
      : 'complete';
  } catch (err) {
    console.error(JSON.stringify({ type: 'subscription-tier-restore-error', name: err?.name || 'unknown' }));
    return 'complete'; // single paid plan: Job Hunt Pass
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

  const idempotency = stripeWebhookIdempotencyConfiguration(process.env);
  if (!idempotency) {
    console.error('Durable Stripe webhook idempotency is not configured');
    await recordConfiguredJobAgentOperationalEvent('stripe_webhook_failure');
    await sendConfiguredJobAgentOperatorAlert('stripe_webhook_processing_failure');
    return res.status(503).json({ error: 'Webhook processing is temporarily unavailable.' });
  }

  const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(JSON.stringify({ type: 'stripe-webhook-signature-failed', name: err?.name || 'unknown' }));
    alertOnAbuse('webhook_sig_failure', req.headers['x-real-ip'] || 'unknown', err.message);
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  let claim;
  try {
    claim = await claimStripeWebhookEvent({ ...idempotency, eventId: event.id });
  } catch (error) {
    console.error('Stripe webhook durable claim failed:', error?.name || 'unknown');
    await recordConfiguredJobAgentOperationalEvent('stripe_webhook_failure');
    await sendConfiguredJobAgentOperatorAlert('stripe_webhook_processing_failure');
    return res.status(503).json({ error: 'Webhook processing is temporarily unavailable.' });
  }
  if (claim.status === 'completed') {
    await recordConfiguredJobAgentOperationalEvent('stripe_webhook_duplicate');
    return res.status(200).json({ received: true, duplicate: true });
  }
  if (claim.status === 'busy') {
    await recordConfiguredJobAgentOperationalEvent('stripe_webhook_retry_deferred');
    return res.status(503).json({ error: 'Webhook event is already processing; retry later.' });
  }
  const alertKey = `stripe-webhook-${claim.eventReference}`;

  // ── Handle events ──────────────────────────────────────────────────────────
  try {
    switch (event.type) {

    case 'checkout.session.completed': {
      const session      = event.data.object;
      const email        = session.customer_details?.email || session.customer_email || '';
      const name         = session.customer_details?.name  || '';
      const amountPaid   = session.amount_total ? `$${(session.amount_total / 100).toFixed(2)}` : 'unknown';
      console.log('Checkout complete');

      const tier      = await getTierFromSession(stripe, session.id);
      const tierLabel = 'Job Hunt Pass';
      console.log(JSON.stringify({ type: 'stripe-checkout-completed', outcome: 'observed' }));

      // Sync to GHL CRM
      await pushToGHL({ email, name, tier });

      // Notify Evan — reply-to set so he can follow up directly
      await sendAdminAlert(
        `💰 New subscriber — ${tierLabel} plan`,
        `Name:   ${name || '(not provided)'}\nEmail:  ${email}\nPlan:   ${tierLabel}\nAmount: ${amountPaid}\nTime:   ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}\n\nContact has been added to GHL automatically.`,
        email,
        alertKey,
      );
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      console.log(JSON.stringify({ type: 'stripe-subscription-updated', status: sub.status }));
      // Alert if subscription moves to a non-active state (past_due, unpaid, etc.)
      if (!['active', 'trialing'].includes(sub.status)) {
        await sendAdminAlert(
          `⚠️ Subscription status changed: ${sub.status}`,
          `Subscription ID: ${sub.id}\nCustomer: ${sub.customer}\nStatus: ${sub.status}\nCheck Stripe for details.`,
          '', alertKey,
        );
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      console.log(JSON.stringify({ type: 'stripe-subscription-cancelled', status: 'observed' }));
      // Update GHL — mark contact as churned
      await updateGHLOnChurn({ customerId: sub.customer, stripe, event: 'cancelled' });
      // Alert Evan
      await sendAdminAlert(
        `❌ Subscription cancelled`,
        `Subscription ID: ${sub.id}\nCustomer ID: ${sub.customer}\nCancelled at: ${new Date().toLocaleString()}\n\nCheck Stripe and reach out to win them back.`,
        '', alertKey,
      );
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const amountDollars = (invoice.amount_due / 100).toFixed(2);
      console.log(JSON.stringify({ type: 'stripe-payment-failed', status: 'observed' }));
      // Update GHL — tag contact as payment_failed
      await updateGHLOnChurn({ customerId: invoice.customer, stripe, event: 'payment_failed' });
      // Alert Evan
      await sendAdminAlert(
        `⚠️ Payment failed — $${amountDollars}`,
        `Customer ID: ${invoice.customer}\nInvoice ID: ${invoice.id}\nAmount due: $${amountDollars}\nAttempt: ${invoice.attempt_count}\n\nStripe will retry automatically. Consider reaching out.`,
        '', alertKey,
      );
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
    }
    await completeStripeWebhookEvent({ ...idempotency, eventId: event.id, leaseToken: claim.leaseToken });
    await recordConfiguredJobAgentOperationalEvent('stripe_webhook_completed');
  } catch (error) {
    await releaseStripeWebhookEvent({ ...idempotency, eventId: event.id, leaseToken: claim.leaseToken }).catch(() => {});
    console.error('Stripe webhook processing failed:', error?.name || 'unknown');
    await recordConfiguredJobAgentOperationalEvent('stripe_webhook_failure');
    await sendConfiguredJobAgentOperatorAlert('stripe_webhook_processing_failure');
    return res.status(500).json({ error: 'Webhook processing failed and will be retried.' });
  }

  return res.status(200).json({ received: true });
}
