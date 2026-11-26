const $ = (id) => document.getElementById(id);
const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
const BUCKET = 'media';
let DB = { designs: [], hero: '' };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
let toastTimer;
function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = 'toast', 3200);
}
const ck = (r) => { if (r.error) throw r.error; return r.data; };

// ---------- storage helpers ----------
async function upload(file, folder) {
  if (file.size > 6 * 1024 * 1024) throw new Error('Image must be under 6 MB');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  ck(await sb.storage.from(BUCKET).upload(path, file, { cacheControl: '31536000', contentType: file.type }));
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
async function removeFile(url) {
  if (!url || !url.includes('/' + BUCKET + '/')) return;
  await sb.storage.from(BUCKET).remove([decodeURIComponent(url.split('/' + BUCKET + '/')[1])]);
}

// ---------- login / logout ----------
function showLogin() { $('appView').hidden = true; $('loginView').hidden = false; }
function showApp() { $('loginView').hidden = true; $('appView').hidden = false; load(); }

$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('loginMsg').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
  if (error) { $('loginMsg').textContent = 'Wrong email or password. Try again.'; return; }
  $('pw').value = '';
  showApp();
};
$('logout').onclick = async () => { await sb.auth.signOut(); showLogin(); };
sb.auth.getSession().then(({ data }) => data.session ? showApp() : showLogin());

// ---------- tabs ----------
document.querySelectorAll('[data-tab]').forEach(a => a.onclick = (e) => {
  e.preventDefault();
  document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === a));
  $('tab-designs').hidden = a.dataset.tab !== 'designs';
  $('tab-hero').hidden = a.dataset.tab !== 'hero';
});

// ---------- load + render ----------
async function load() {
  try {
    const designs = ck(await sb.from('designs').select('*').order('sort'));
    const h = ck(await sb.from('settings').select('value').eq('key', 'hero').maybeSingle());
    DB = { designs, hero: (h && h.value) || '' };
    render();
  } catch (e) { toast(e.message, true); }
}

function render() {
  const d = DB.designs;
  $('sTotal').textContent = d.length;
  $('sCats').textContent = new Set(d.map(x => x.cat).filter(Boolean)).size;
  $('sAvg').textContent = fmt(d.length ? Math.round(d.reduce((s, x) => s + (+x.price || 0), 0) / d.length) : 0);
  $('countLbl').textContent = d.length ? `(${d.length})` : '';
  $('emptyMsg').hidden = d.length > 0;

  const dl = $('catList'); dl.textContent = '';
  [...new Set([...d.map(x => x.cat).filter(Boolean), 'Bridal', 'Arabic', 'Indian', 'Minimal', 'Kids'])].forEach(c => {
    const o = el('option'); o.value = c; dl.appendChild(o);
  });

  const list = $('list'); list.textContent = '';
  d.forEach((x, i) => list.appendChild(row(x, i, d.length)));

  const hp = $('heroPrev'); hp.textContent = '';
  if (DB.hero) { const im = new Image(); im.src = DB.hero; im.alt = 'Hero'; hp.appendChild(im); }
  else hp.appendChild(el('span', 0, 'No image uploaded yet'));
  $('heroDel').hidden = !DB.hero;
}

async function swap(i, j) {
  const a = DB.designs[i], b = DB.designs[j];
  ck(await sb.from('designs').update({ sort: b.sort }).eq('id', a.id));
  ck(await sb.from('designs').update({ sort: a.sort }).eq('id', b.id));
}

function row(x, i, total) {
  const r = el('div', 'row');
  let th;
  if (x.img) { th = new Image(); th.src = x.img; th.className = 'thumb'; th.alt = x.name; }
  else th = el('div', 'thumb', 'No photo');

  const col = el('div');
  const cols = el('div', 'cols');
  const name = el('input'); name.value = x.name; name.placeholder = 'Name';
  const cat = el('input'); cat.value = x.cat || ''; cat.placeholder = 'Category'; cat.setAttribute('list', 'catList');
  const price = el('input'); price.type = 'number'; price.min = 0; price.value = x.price; price.placeholder = 'Price';
  cols.append(name, cat, price);

  const bt = el('div', 'bt');
  const save = el('button', 'btn sm solid', 'Save');
  save.onclick = () => run(save, async () => ck(await sb.from('designs').update({ name: name.value, cat: cat.value, price: +price.value || 0 }).eq('id', x.id)), 'Saved');

  const file = el('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp'; file.hidden = true;
  const cp = el('button', 'btn sm', 'Change photo'); cp.onclick = () => file.click();
  file.onchange = () => { if (file.files[0]) run(cp, async () => {
    const url = await upload(file.files[0], 'designs');
    ck(await sb.from('designs').update({ img: url }).eq('id', x.id));
    await removeFile(x.img);
  }, 'Photo updated'); };

  const up = el('button', 'btn sm', '↑'); up.disabled = i === 0;
  up.onclick = () => run(up, () => swap(i, i - 1));
  const dn = el('button', 'btn sm', '↓'); dn.disabled = i === total - 1;
  dn.onclick = () => run(dn, () => swap(i, i + 1));

  const del = el('button', 'btn sm danger', 'Delete');
  del.onclick = () => { if (confirm(`Delete “${x.name}”?`)) run(del, async () => {
    ck(await sb.from('designs').delete().eq('id', x.id));
    await removeFile(x.img);
  }, 'Deleted'); };

  bt.append(save, cp, up, dn, del, file);
  col.append(cols, bt);
  r.append(th, col);
  return r;
}

async function run(btn, fn, okMsg) {
  btn.disabled = true;
  try { await fn(); if (okMsg) toast(okMsg); await load(); }
  catch (e) { toast(e.message, true); btn.disabled = false; }
}

// ---------- add new ----------
let newFile = null;
$('newFile').onchange = () => {
  newFile = $('newFile').files[0] || null;
  if (newFile) { $('newPrev').src = URL.createObjectURL(newFile); $('newPrev').hidden = false; $('newHint').hidden = true; }
};
$('addForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const img = newFile ? await upload(newFile, 'designs') : null;
    const sort = DB.designs.reduce((m, x) => Math.max(m, x.sort || 0), 0) + 1;
    ck(await sb.from('designs').insert({ name: $('newName').value, cat: $('newCat').value, price: +$('newPrice').value || 0, img, sort }));
    e.target.reset(); newFile = null; $('newPrev').hidden = true; $('newHint').hidden = false;
    toast('Design added'); await load();
  } catch (err) { toast(err.message, true); }
  btn.disabled = false;
};

// ---------- hero image ----------
$('heroFile').onchange = async () => {
  const f = $('heroFile').files[0];
  if (!f) return;
  try {
    const url = await upload(f, 'hero');
    ck(await sb.from('settings').upsert({ key: 'hero', value: url }));
    await removeFile(DB.hero);
    toast('Hero image updated'); await load();
  } catch (e) { toast(e.message, true); }
  $('heroFile').value = '';
};
$('heroDel').onclick = async () => {
  if (!confirm('Remove hero image?')) return;
  try {
    ck(await sb.from('settings').upsert({ key: 'hero', value: '' }));
    await removeFile(DB.hero);
    toast('Removed'); await load();
  } catch (e) { toast(e.message, true); }
};