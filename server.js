const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // CHANGE THIS
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ designs: [], hero: '' }));

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDB = (d) => fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));

// ---------- image upload ----------
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype];
    cb(null, Date.now().toString(36) + crypto.randomBytes(4).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true) : cb(new Error('Only JPG, PNG or WEBP images allowed'))
});
const removeFile = (url) => {
  if (!url || !url.startsWith('/uploads/')) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
};

// ---------- simple session auth ----------
const sessions = new Map(); // token -> expiry
const getCookie = (req, name) => {
  const m = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return m ? m.slice(name.length + 1) : null;
};
const isAuthed = (req) => {
  const t = getCookie(req, 'sid');
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
};
const requireAdmin = (req, res, next) => isAuthed(req) ? next() : res.status(401).json({ error: 'Not logged in' });

const app = express();
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- public API ----------
app.get('/api/data', (req, res) => res.json(readDB()));

// ---------- auth ----------
let tries = {};
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  tries[ip] = (tries[ip] || []).filter(t => t > Date.now() - 15 * 60 * 1000);
  if (tries[ip].length >= 8) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const a = Buffer.from(String(req.body.password || ''));
  const b = Buffer.from(ADMIN_PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) { tries[ip].push(Date.now()); return res.status(401).json({ error: 'Wrong password' }); }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  sessions.delete(getCookie(req, 'sid'));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/admin/check', (req, res) => res.json({ authed: isAuthed(req) }));

// ---------- designs ----------
app.post('/api/admin/designs', requireAdmin, upload.single('image'), (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Design name is required' });
  const db = readDB();
  const d = {
    id: Date.now().toString(36),
    name,
    cat: String(req.body.cat || '').trim(),
    price: Math.max(0, Number(req.body.price) || 0),
    img: req.file ? '/uploads/' + req.file.filename : ''
  };
  db.designs.unshift(d);
  writeDB(db);
  res.json(d);
});

app.put('/api/admin/designs/:id', requireAdmin, upload.single('image'), (req, res) => {
  const db = readDB();
  const d = db.designs.find(x => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  if (req.body.name !== undefined) d.name = String(req.body.name).trim() || d.name;
  if (req.body.cat !== undefined) d.cat = String(req.body.cat).trim();
  if (req.body.price !== undefined) d.price = Math.max(0, Number(req.body.price) || 0);
  if (req.file) { removeFile(d.img); d.img = '/uploads/' + req.file.filename; }
  writeDB(db);
  res.json(d);
});

app.post('/api/admin/designs/:id/move', requireAdmin, (req, res) => {
  const db = readDB();
  const i = db.designs.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  const j = req.body.dir === 'up' ? i - 1 : i + 1;
  if (j >= 0 && j < db.designs.length) [db.designs[i], db.designs[j]] = [db.designs[j], db.designs[i]];
  writeDB(db);
  res.json({ ok: true });
});

app.delete('/api/admin/designs/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const d = db.designs.find(x => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  removeFile(d.img);
  db.designs = db.designs.filter(x => x.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ---------- hero image ----------
app.post('/api/admin/hero', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image' });
  const db = readDB();
  removeFile(db.hero);
  db.hero = '/uploads/' + req.file.filename;
  writeDB(db);
  res.json({ hero: db.hero });
});
app.delete('/api/admin/hero', requireAdmin, (req, res) => {
  const db = readDB();
  removeFile(db.hero);
  db.hero = '';
  writeDB(db);
  res.json({ ok: true });
});

// ---------- errors ----------
app.use((err, req, res, next) => {
  res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image too large (max 6 MB)' : err.message });
});

app.listen(PORT, () => {
  console.log(`Website:  http://localhost:${PORT}`);
  console.log(`Admin:    http://localhost:${PORT}/admin-dashboard.html`);
  if (!process.env.ADMIN_PASSWORD) console.log('WARNING: using default password "admin123". Set ADMIN_PASSWORD before going live.');
});
