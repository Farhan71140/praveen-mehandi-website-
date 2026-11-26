// Runs on Vercel: copies the website into dist/ and writes the Supabase settings into it.
const fs = require('fs');
const url = (process.env.SUPABASE_URL || '').trim().replace(/\/(rest\/v1)?\/?$/, '');
const key = (process.env.SUPABASE_KEY || '').trim();
const stop = (msg) => { console.error('BUILD STOPPED: ' + msg); process.exit(1); };

if (!url || !key) stop('Add SUPABASE_URL and SUPABASE_KEY in Vercel > Settings > Environment Variables (Production).');
if (url.includes('YOUR-') || key.includes('YOUR-')) stop('The variables still contain placeholder text.');
if (!url.startsWith('https://')) stop('SUPABASE_URL must start with https://');

let role = '';
try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).role; } catch (e) {}
if (key.startsWith('sb_secret_') || role === 'service_role') stop('SUPABASE_KEY is a SECRET key. Use the publishable or anon key.');

// works whether the website files are in public/ or at the top of the project
const src = fs.existsSync('public/index.html') ? 'public' : '.';
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist/js', { recursive: true });
for (const item of ['index.html', 'admin.html', 'css', 'js', 'images']) {
  const from = `${src}/${item}`;
  if (fs.existsSync(from)) fs.cpSync(from, `dist/${item}`, { recursive: true });
  else console.warn('Missing: ' + from);
}
for (const f of ['index.html', 'admin.html', 'js/main.js', 'js/admin.js']) {
  if (!fs.existsSync(`dist/${f}`)) stop(`Could not find ${src}/${f}`);
}
fs.writeFileSync('dist/js/config.js',
`window.SUPABASE_URL = ${JSON.stringify(url)};
window.SUPABASE_KEY = ${JSON.stringify(key)};
window.PHONE = '918533072761';
`);
console.log(`Supabase settings written. Source folder: ${src}`);
