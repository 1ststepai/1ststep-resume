/**
 * setup-ghl-pipeline.js
 *
 * One-time script — creates the "1stStep.ai Users" pipeline in GHL
 * with all stages, then prints the IDs you need to add to Vercel.
 *
 * Usage:
 *   GHL_API_KEY=your_key GHL_LOCATION_ID=your_loc node scripts/setup-ghl-pipeline.js
 */

const API_KEY     = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

if (!API_KEY || !LOCATION_ID) {
  console.error('❌  Missing env vars. Run as:');
  console.error('   GHL_API_KEY=xxx GHL_LOCATION_ID=xxx node scripts/setup-ghl-pipeline.js');
  process.exit(1);
}

const BASE    = 'https://services.leadconnectorhq.com';
const HEADERS = {
  'Authorization': `Bearer ${API_KEY}`,
  'Version':       '2021-07-28',
  'Content-Type':  'application/json',
};

// ── Pipeline stages in order ──────────────────────────────────────────────────
const STAGES = [
  { name: '🧪 Beta Signup',            position: 1 },
  { name: '✅ Active User',             position: 2 },
  { name: '🔥 Power User',             position: 3 },
  { name: '⏳ Trial Ending',           position: 4 },
  { name: '💳 Converted — Essential',  position: 5 },
  { name: '💎 Converted — Complete',   position: 6 },
  { name: '❌ Churned',                position: 7 },
];

async function ghl(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

async function main() {
  console.log('🚀  Setting up 1stStep.ai GHL pipeline…\n');

  // ── Step 1: Check for existing pipeline ────────────────────────────────────
  console.log('1️⃣   Checking for existing pipelines…');
  const existing = await ghl('GET', `/opportunities/pipelines?locationId=${LOCATION_ID}`);
  if (!existing.ok) {
    console.error('❌  Could not fetch pipelines:', existing.data);
    process.exit(1);
  }

  const pipelines = existing.data?.pipelines || [];
  const existingPipeline = pipelines.find(p =>
    p.name?.toLowerCase().includes('1ststep') ||
    p.name?.toLowerCase().includes('1st step')
  );

  if (existingPipeline) {
    console.log(`⚠️   Found existing pipeline: "${existingPipeline.name}" (${existingPipeline.id})`);
    console.log('     Delete it in GHL first if you want a fresh setup, or use the IDs below.\n');
    printIds(existingPipeline.id, existingPipeline.stages || []);
    return;
  }

  // ── Step 2: Create pipeline ─────────────────────────────────────────────────
  console.log('2️⃣   Creating "1stStep.ai Users" pipeline…');
  const created = await ghl('POST', '/opportunities/pipelines', {
    locationId: LOCATION_ID,
    name:       '1stStep.ai Users',
    showInFunnel:    true,
    showInPieChart:  true,
  });

  if (!created.ok) {
    console.error('❌  Pipeline creation failed:', JSON.stringify(created.data, null, 2));
    process.exit(1);
  }

  const pipelineId = created.data?.pipeline?.id || created.data?.id;
  if (!pipelineId) {
    console.error('❌  Could not read pipeline ID from response:', created.data);
    process.exit(1);
  }
  console.log(`✅  Pipeline created: ${pipelineId}\n`);

  // ── Step 3: Create stages ───────────────────────────────────────────────────
  console.log('3️⃣   Creating pipeline stages…');
  const createdStages = [];

  for (const stage of STAGES) {
    const r = await ghl('POST', `/opportunities/pipelines/${pipelineId}/stages`, {
      locationId: LOCATION_ID,
      name:       stage.name,
      position:   stage.position,
    });

    if (!r.ok) {
      console.error(`❌  Failed to create stage "${stage.name}":`, r.data);
      continue;
    }

    const stageId = r.data?.stage?.id || r.data?.id;
    createdStages.push({ name: stage.name, id: stageId });
    console.log(`   ✅  ${stage.name}  →  ${stageId}`);
  }

  console.log('\n');
  printIds(pipelineId, createdStages);
}

function printIds(pipelineId, stages) {
  console.log('══════════════════════════════════════════════════════');
  console.log('  ADD THESE TO VERCEL ENVIRONMENT VARIABLES');
  console.log('══════════════════════════════════════════════════════\n');
  console.log(`GHL_PIPELINE_ID=${pipelineId}\n`);

  const stageMap = {
    '🧪 Beta Signup':           'GHL_STAGE_BETA_SIGNUP',
    '✅ Active User':            'GHL_STAGE_ACTIVE_USER',
    '🔥 Power User':            'GHL_STAGE_POWER_USER',
    '⏳ Trial Ending':          'GHL_STAGE_TRIAL_ENDING',
    '💳 Converted — Essential': 'GHL_STAGE_CONVERTED_ESSENTIAL',
    '💎 Converted — Complete':  'GHL_STAGE_CONVERTED_COMPLETE',
    '❌ Churned':               'GHL_STAGE_CHURNED',
  };

  for (const stage of stages) {
    const envKey = stageMap[stage.name] || `GHL_STAGE_${stage.name.replace(/[^A-Z0-9]/gi,'_').toUpperCase()}`;
    console.log(`${envKey}=${stage.id}`);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Once added to Vercel, re-deploy for changes to take effect.');
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
