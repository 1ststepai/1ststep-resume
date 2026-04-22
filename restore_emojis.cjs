const fs = require('fs');
const { execSync } = require('child_process');

let currentHtml = fs.readFileSync('index.html', 'utf8');

// Dictionary of manual replacements for the most common mangled strings
const dict = [
  ['?? I have a resume', '📄 I have a resume'],
  ['?? I need to build one', '✨ I need to build one'],
  ['?? Applied (manual)', '👋 Applied (manual)'],
  ['?? Screening', '📞 Screening'],
  ['?? Interview', '💬 Interview'],
  ['?? Offer', '🎉 Offer'],
  ['<div class="empty-icon">??</div>', '<div class="empty-icon">📋</div>'],
  ['?? Formatted Resume', '✨ Formatted Resume'],
  ['?? Copy Text', '📋 Copy Text'],
  ['?? Copy Cover Letter', '📋 Copy Cover Letter'],
  ['? Cover Letter (.docx)', '✨ Cover Letter (.docx)'],
  ['?? Interview Prep', '💬 Interview Prep'],
  ['?? Apply Now', '🚀 Apply Now'],
  ['? Mark Applied', '✅ Mark Applied'],
  ['?? Monthly limit reached', '🔒 Monthly limit reached'],
  ['?? This feature requires a paid plan', '🔒 This feature requires a paid plan'],
  ['?? Processing...', '⚙️ Processing...'],
  ['?? AI Coach requires', '🔒 AI Coach requires'],
  ['?? Network error', '🌐 Network error'],
  ['<div style="font-size:36px;margin-bottom:12px">??</div>', '<div style="font-size:36px;margin-bottom:12px">🔒</div>'],
  ['<div style="font-size:32px;margin-bottom:12px">??</div>', '<div style="font-size:32px;margin-bottom:12px">🔒</div>'],
  ['?? Beta access unlocked', '🎉 Beta access unlocked'],
  ['?? Questions to Ask Them', '❓ Questions to Ask Them'],
  ['??? Get Ahead Of', '🚩 Get Ahead Of'],
  ['<span style="font-size:16px;flex-shrink:0;margin-top:1px">??</span>', '<span style="font-size:16px;flex-shrink:0;margin-top:1px">🧠</span>'],
  ['?? email@example.com', '📧 email@example.com'],
  ['?? 555-000-0000', '📞 555-000-0000'],
  ['?? City, State', '📍 City, State'],
  ['?? Unlock Formatted Templates ?', '✨ Unlock Formatted Templates →'],
  ['?? Skill Gap Analysis', '🧠 Skill Gap Analysis'],
  ['?? Skill Breakdown', '📊 Skill Breakdown'],
  ['? Skills You Have', '✅ Skills You Have'],
  ['?? Skills You Have', '✅ Skills You Have'],
  ['?? Missing  Required', '❌ Missing — Required'],
  ['?? Missing  Nice to Have', '⚠️ Missing — Nice to Have'],
  ['?? Your Top Strengths', '💪 Your Top Strengths'],
  ['?? Pro tip:', '💡 Pro tip:'],
  ['? Reading your LinkedIn PDF', '⏳ Reading your LinkedIn PDF...'],
  ['?? Could not extract text from this PDF', '⚠️ Could not extract text from this PDF'],
  ['? LinkedIn profile imported!', '✅ LinkedIn profile imported!'],
  ['? Could not read that PDF', '❌ Could not read that PDF'],
  ['?? Interview Cheat Sheet', '💬 Interview Cheat Sheet'],
  ['<div style="font-size:32px;margin-bottom:10px">??</div>', '<div style="font-size:32px;margin-bottom:10px">💬</div>'],
  ['?? What Changed', '✨ What Changed'],
  ['<div style="font-size:40px;margin-bottom:12px">??</div>', '<div style="font-size:40px;margin-bottom:12px">✨</div>'],
  ['?? Choose a Resume Template', '🎨 Choose a Resume Template'],
  ['?? Leave any field blank to let the AI pull it from your resume text.', '💡 Leave any field blank to let the AI pull it from your resume text.'],
  ['<div style="font-size:32px;margin-bottom:10px">???</div>', '<div style="font-size:32px;margin-bottom:10px">🎨</div>'],
  ['?? ' + 'email@example.com', '📧 email@example.com'],
  ['?? Backup downloaded', '✅ Backup downloaded'],
  ['? Backup downloaded', '✅ Backup downloaded'],
  ['? items restored', '✅ items restored'],
  ['? Couldn\'t read that file', '❌ Couldn\'t read that file'],
  ['? Marked as applied', '✅ Marked as applied'],
  ['?? Opening job', '🚀 Opening job'],
  ['<div style="width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,0.2);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:22px;color:rgba(255,255,255,0.8)">??</div>', '<div style="width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,0.2);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:22px;color:rgba(255,255,255,0.8)">👤</div>'],
  ['<div style="font-size:28px;margin-bottom:8px">??</div>', '<div style="font-size:28px;margin-bottom:8px">🧠</div>'],
  ['>??<', '>🔥<'],
  ['icon: \'??\'', 'icon: \'✨\''],
  ['<span class="job-meta-pill">?? ${', '<span class="job-meta-pill">📍 ${'], // location
  ['<span class="job-meta-pill" style="color:#6EE7B7;border-color:rgba(14,159,110,0.3);background:rgba(14,159,110,0.07)">?? ${', '<span class="job-meta-pill" style="color:#6EE7B7;border-color:rgba(14,159,110,0.3);background:rgba(14,159,110,0.07)">💰 ${'], // salary
  ['<span class="job-meta-pill">?? ${app.appliedDate}</span>', '<span class="job-meta-pill">📅 ${app.appliedDate}</span>'],
  ['<span class="job-meta-pill">?? ${escHtml(app.contactName)', '<span class="job-meta-pill">👤 ${escHtml(app.contactName)'],
  [')">?? ${escHtml(app.notes)', ')\">📝 ${escHtml(app.notes)'],
  ['<span style="font-size:20px;width:28px;text-align:center">??</span>', '<span style="font-size:20px;width:28px;text-align:center">✨</span>'], // generic sidebar icons replacement if left over
  ['<div style="font-size:11px;margin-bottom:4px">?? ${_link(d.linkedin', '<div style="font-size:11px;margin-bottom:4px">🔗 ${_link(d.linkedin'],
  ['<div style="font-size:11px;margin-bottom:4px;word-break:break-all">?? ${_link(d.website', '<div style="font-size:11px;margin-bottom:4px;word-break:break-all">🌐 ${_link(d.website'],
  ['<div style="font-size:12.5px;color:#1e293b;padding:2px 0;border-bottom:1px solid #F1F5F9">? ${_e(', '<div style="font-size:12.5px;color:#1e293b;padding:2px 0;border-bottom:1px solid #F1F5F9">✔️ ${_e(']
];

for (const [bad, good] of dict) {
  currentHtml = currentHtml.split(bad).join(good);
}

// Special dynamic fixes for string interpolation lines that lost unicode characters:
currentHtml = currentHtml.replace(/_sgPill\('\\? ' \+ s, 'green'\)/g, "_sgPill('✅ ' + s, 'green')");
currentHtml = currentHtml.replace(/_sgPill\('\\? ' \+ s, 'red'\)/g, "_sgPill('❌ ' + s, 'red')");
currentHtml = currentHtml.replace(/_coachAppendBubble\('assistant', `\\?\\? \$\{msg\}`\);/g, "_coachAppendBubble('assistant', `💬 ${msg}`);");

fs.writeFileSync('index.html', currentHtml, 'utf8');
