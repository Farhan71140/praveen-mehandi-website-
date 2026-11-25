const fs = require('fs');
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_KEY in Vercel'); process.exit(1); }
fs.writeFileSync('public/js/config.js',
`window.SUPABASE_URL = ${JSON.stringify(url)};
window.SUPABASE_KEY = ${JSON.stringify(key)};
window.PHONE = '918533072761';
`);