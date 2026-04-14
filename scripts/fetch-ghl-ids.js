/**
 * fetch-ghl-ids.js
 *
 * Run after creating the "1stStep.ai Users" pipeline manually in GHL.
 * Prints all environment variable assignments you need to add to Vercel.
 *
 * Usage:
 *   $env:GHL_API_KEY="pit-xxx"; $env:GHL_LOCATION_ID="xxx"; node scripts/fetch-ghl-ids.js
 */

const apiKey = process.env.GHL_API_KEY;
const locationId = process.env.GHL_LOCATION_ID;

if (!apiKey || apiKey === 'your_key' || !locationId || locationId === 'your_location_id') {
  console.error('❌  Set GHL_API_KEY and GHL_LOCATION_ID before running this script.');
  process.exit(1);
}

async function fetchPipelines() {
  const res = await fetch(
    `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${locationId}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: '2021-07-28',
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`❌  GHL API error ${res.status}:`, body);
    process.exit(1);
  }

  return res.json();
}

const STAGE_NAMES = {
  'Beta Signup':              'GHL_STAGE_BETA_SIGNUP',
  'Active User':              'GHL_STAGE_ACTIVE_USER',
  'Power User':               'GHL_STAGE_POWER_USER',
  'Trial Ending':             'GHL_STAGE_TRIAL_ENDING',
  'Converted — Essential':    'GHL_STAGE_CONVERTED_ESSENTIAL',
  'Converted - Essential':    'GHL_STAGE_CONVERTED_ESSENTIAL',
  'Converted — Complete':     'GHL_STAGE_CONVERTED_COMPLETE',
  'Converted - Complete':     'GHL_STAGE_CONVERTED_COMPLETE',
  'Churned':                  'GHL_STAGE_CHURNED',
};

async function main() {
  console.log('\nFetching pipelines from GHL...\n');

  const data = await fetchPipelines();
  const pipelines = data.pipelines || [];

  if (pipelines.length === 0) {
    console.log('⚠️  No pipelines found. Make sure you created "1stStep.ai Users" in GHL first.');
    return;
  }

  // Find the 1stStep pipeline
  const target = pipelines.find(p =>
    p.name.toLowerCase().includes('1ststep') ||
    p.name.toLowerCase().includes('1st step')
  );

  if (!target) {
    console.log('⚠️  Could not find "1stStep.ai Users" pipeline. Pipelines found:');
    pipelines.forEach(p => console.log(`   - ${p.name} (${p.id})`));
    console.log('\nRename your pipeline to include "1stStep" and re-run, or copy the IDs manually from above.');
    return;
  }

  console.log(`✅  Found pipeline: "${target.name}"\n`);
  console.log('='.repeat(60));
  console.log('ADD THESE TO VERCEL ENVIRONMENT VARIABLES:');
  console.log('='.repeat(60));
  console.log(`GHL_PIPELINE_ID=${target.id}`);

  const stages = target.stages || [];
  const missing = [];

  for (const stage of stages) {
    const envKey = STAGE_NAMES[stage.name] || STAGE_NAMES[stage.name.trim()];
    if (envKey) {
      console.log(`${envKey}=${stage.id}`);
    } else {
      missing.push(stage);
    }
  }

  if (missing.length > 0) {
    console.log('\n⚠️  Unrecognized stage names (check spelling in GHL):');
    missing.forEach(s => console.log(`   - "${s.name}" (id: ${s.id})`));
    console.log('\nExpected stage names:');
    Object.keys(STAGE_NAMES).filter((v, i, a) => a.indexOf(v) === i).forEach(n => console.log(`   - ${n}`));
  }

  console.log('='.repeat(60));
  console.log('\nCopy all lines above into Vercel → Settings → Environment Variables, then redeploy.\n');
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
