const PHONE = window.PHONE || '918533072761';
const $ = (id) => document.getElementById(id);
const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const bookURL = (name) => `https://wa.me/${PHONE}?text=` + encodeURIComponent('Hi Prabhas Mehandi Art, I want to book the design: ' + name);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const configured = window.SUPABASE_URL && !window.SUPABASE_URL.includes('YOUR-');
const sb = configured ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY) : null;

let DESIGNS = [], active = 'All', query = '', sortBy = 'default', loaded = false;

function renderHero(src) {
  if (!src) return;
  const box = $('heroMedia');
  box.textContent = '';
  const img = new Image();
  img.src = src; img.alt = 'Prabhas Mehandi Art';
  box.appendChild(img);
}

function openLb(d) {
  $('lbImg').src = d.img; $('lbImg').alt = d.name;
  $('lbCat').textContent = d.cat || '';
  $('lbName').textContent = d.name;
  $('lbPrice').textContent = fmt(d.price) + ' onwards';
  $('lbBook').href = bookURL(d.name);
  $('lb').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLb() { $('lb').hidden = true; document.body.style.overflow = ''; }
$('lbX').onclick = closeLb;
$('lb').onclick = (e) => { if (e.target === $('lb')) closeLb(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLb(); });

function renderFilters() {
  const f = $('filters'); f.textContent = '';
  const cats = ['All', ...new Set(DESIGNS.map(d => d.cat).filter(Boolean))];
  if (!cats.includes(active)) active = 'All';
  cats.forEach(c => {
    const b = el('button', 'chip', c);
    b.setAttribute('aria-pressed', c === active);
    b.onclick = () => { active = c; renderFilters(); renderGrid(); };
    f.appendChild(b);
  });
}

function renderGrid() {
  const grid = $('grid'); grid.textContent = '';

  if (!loaded || !DESIGNS.length) {
    for (let i = 0; i < 6; i++) {
      const c = el('article', 'card empty' + (loaded ? '' : ' skel'));
      const a = el('div', 'art'); a.appendChild(el('div', 'ph', loaded ? 'Design photo' : ''));
      const f = el('div', 'info');
      f.append(el('small', 0, 'Category'), el('h3', 0, 'Design name'));
      const r = el('div', 'row'); r.append(el('div', 'price', '₹ ---'), el('span', 'note', loaded ? 'Coming soon' : ''));
      f.appendChild(r); c.append(a, f); grid.appendChild(c);
    }
    return;
  }

  let list = DESIGNS.filter(d => (active === 'All' || d.cat === active) &&
    (d.name + ' ' + (d.cat || '')).toLowerCase().includes(query));
  if (sortBy === 'low') list = [...list].sort((a, b) => a.price - b.price);
  if (sortBy === 'high') list = [...list].sort((a, b) => b.price - a.price);

  if (!list.length) { grid.appendChild(el('p', 'none', 'No designs match your search. Try another word or clear the filter.')); return; }

  list.forEach(d => {
    const c = el('article', 'card');
    const a = el('div', 'art');
    if (d.img) {
      const im = new Image(); im.src = d.img; im.alt = d.name; im.loading = 'lazy';
      a.appendChild(im); a.tabIndex = 0; a.role = 'button';
      a.onclick = () => openLb(d);
      a.onkeydown = (e) => { if (e.key === 'Enter') openLb(d); };
    } else a.appendChild(el('div', 'ph', 'No photo'));
    const f = el('div', 'info');
    f.append(el('small', 0, d.cat || ''), el('h3', 0, d.name));
    const r = el('div', 'row');
    const p = el('div', 'price', fmt(d.price) + ' '); p.appendChild(el('span', 0, 'onwards'));
    const b = el('a', 'btn book', 'Book'); b.href = bookURL(d.name); b.target = '_blank'; b.rel = 'noopener';
    r.append(p, b); f.appendChild(r); c.append(a, f); grid.appendChild(c);
  });
}

$('search').oninput = (e) => { query = e.target.value.trim().toLowerCase(); renderGrid(); };
$('sort').onchange = (e) => { sortBy = e.target.value; renderGrid(); };
$('yr').textContent = new Date().getFullYear();

async function init() {
  renderGrid();
  if (!sb) { loaded = true; renderGrid(); return; }
  try {
    const [d, h] = await Promise.all([
      sb.from('designs').select('*').order('sort'),
      sb.from('settings').select('value').eq('key', 'hero').maybeSingle()
    ]);
    if (d.error) throw d.error;
    DESIGNS = d.data || [];
    renderHero(h.data && h.data.value);
  } catch (e) { console.error(e); }
  loaded = true; renderFilters(); renderGrid();
}
init();
