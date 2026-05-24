const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const webpush = require('web-push');

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || 'BIC2Fd-7kb8zEo1neTNQ_M1KO24YNZMulzIEPpWgA6OoYMgI1nmAKHJ03bPzWloTHaCAP7Y60Ghqi12KGM2omUA';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'W8KRRmDON0kfNAR8xuAptm4vJ7AJ7O6X6vA480AIdy4';
webpush.setVapidDetails('mailto:gregvong.coaching@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

const app = express();
const PORT = process.env.PORT || 3001;

// ── Paths ─────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';
const dataDir = isProd ? '/app/data' : path.join(__dirname, 'data');
const uploadDir = isProd ? '/app/data/uploads' : path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Database ──────────────────────────────────────────────────
const db = new DatabaseSync(path.join(dataDir, 'coaching.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'client',
    objectif TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS daily_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    energie INTEGER DEFAULT 5,
    motivation INTEGER DEFAULT 5,
    digestion INTEGER DEFAULT 5,
    fierte INTEGER DEFAULT 5,
    stress INTEGER DEFAULT 5,
    sommeil_qualite INTEGER DEFAULT 5,
    sommeil_heure_coucher TEXT DEFAULT '',
    sommeil_heure_reveil TEXT DEFAULT '',
    training_done INTEGER DEFAULT 0,
    training_type TEXT DEFAULT '',
    training_duree INTEGER DEFAULT 0,
    training_intensite INTEGER DEFAULT 5,
    hydratation INTEGER DEFAULT 5,
    respect_nutrition INTEGER DEFAULT 5,
    fringales INTEGER DEFAULT 0,
    pas INTEGER DEFAULT 0,
    protocol_done INTEGER DEFAULT 0,
    affirmation TEXT DEFAULT '',
    ressenti TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, date)
  );
  CREATE TABLE IF NOT EXISTS weekly_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    week TEXT NOT NULL,
    poids REAL,
    masse_grasse REAL,
    tour_taille INTEGER,
    tour_hanches INTEGER,
    tour_bras_g INTEGER,
    tour_bras_d INTEGER,
    tour_cuisse_g INTEGER,
    tour_cuisse_d INTEGER,
    tour_mollet INTEGER,
    tour_poitrine INTEGER,
    entrainements INTEGER,
    victoires TEXT DEFAULT '',
    difficultes TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, week)
  );
  CREATE TABLE IF NOT EXISTS progress_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    week TEXT NOT NULL,
    filename TEXT NOT NULL,
    type TEXT DEFAULT 'front',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS meal_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    filename TEXT NOT NULL,
    meal_type TEXT DEFAULT 'repas',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subscription TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    read_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    label TEXT DEFAULT '',
    target REAL,
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS coach_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS cycle_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    last_period_start TEXT NOT NULL,
    cycle_length INTEGER DEFAULT 28,
    period_duration INTEGER DEFAULT 5,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS cycle_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    phase TEXT DEFAULT '',
    jour_cycle INTEGER DEFAULT 1,
    energie INTEGER DEFAULT 5,
    douleur INTEGER DEFAULT 0,
    humeur INTEGER DEFAULT 5,
    symptomes TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
  );
`);

// Migrate existing tables (add missing columns silently)
const migrations = [
  'ALTER TABLE daily_checkins ADD COLUMN stress INTEGER DEFAULT 5',
  'ALTER TABLE daily_checkins ADD COLUMN sommeil_qualite INTEGER DEFAULT 5',
  'ALTER TABLE daily_checkins ADD COLUMN sommeil_heure_coucher TEXT DEFAULT ""',
  'ALTER TABLE daily_checkins ADD COLUMN sommeil_heure_reveil TEXT DEFAULT ""',
  'ALTER TABLE daily_checkins ADD COLUMN training_done INTEGER DEFAULT 0',
  'ALTER TABLE daily_checkins ADD COLUMN training_type TEXT DEFAULT ""',
  'ALTER TABLE daily_checkins ADD COLUMN training_duree INTEGER DEFAULT 0',
  'ALTER TABLE daily_checkins ADD COLUMN training_intensite INTEGER DEFAULT 5',
  'ALTER TABLE daily_checkins ADD COLUMN hydratation INTEGER DEFAULT 5',
  'ALTER TABLE daily_checkins ADD COLUMN respect_nutrition INTEGER DEFAULT 5',
  'ALTER TABLE daily_checkins ADD COLUMN fringales INTEGER DEFAULT 0',
  'ALTER TABLE daily_checkins ADD COLUMN pas INTEGER DEFAULT 0',
  'ALTER TABLE weekly_checkins ADD COLUMN masse_grasse REAL',
  'ALTER TABLE weekly_checkins ADD COLUMN tour_hanches INTEGER',
  'ALTER TABLE weekly_checkins ADD COLUMN tour_bras_g INTEGER',
  'ALTER TABLE weekly_checkins ADD COLUMN tour_bras_d INTEGER',
  'ALTER TABLE weekly_checkins ADD COLUMN tour_cuisse_g INTEGER',
  'ALTER TABLE weekly_checkins ADD COLUMN tour_cuisse_d INTEGER',
  'ALTER TABLE weekly_checkins ADD COLUMN tour_mollet INTEGER',
  'ALTER TABLE weekly_checkins ADD COLUMN tour_poitrine INTEGER',
  'ALTER TABLE weekly_checkins ADD COLUMN victoires TEXT DEFAULT ""',
  'ALTER TABLE weekly_checkins ADD COLUMN difficultes TEXT DEFAULT ""',
  'ALTER TABLE weekly_checkins ADD COLUMN notes TEXT DEFAULT ""',
  'ALTER TABLE users ADD COLUMN objectif TEXT DEFAULT ""',
  'ALTER TABLE users ADD COLUMN quote TEXT DEFAULT ""',
  'ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ""',
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) {}
}

// ── Auth helpers ──────────────────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  const h = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (user_id, token) VALUES (?, ?)').run(userId, token);
  return token;
}
function getSession(token) {
  if (!token) return null;
  return db.prepare('SELECT s.user_id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token) || null;
}
function getToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return req.headers['x-token'] || null;
}

// ── Auth middleware ───────────────────────────────────────────
function requireAuth(req, res, next) {
  const session = getSession(getToken(req));
  if (!session) return res.status(401).json({ error: 'Non autorisé' });
  req.user = session;
  next();
}
function requireCoach(req, res, next) {
  const session = getSession(getToken(req));
  if (!session || session.role !== 'coach') return res.status(403).json({ error: 'Accès coach requis' });
  req.user = session;
  next();
}

// ── File upload ───────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── SSE ───────────────────────────────────────────────────────
const sseClients = new Set();
function notifyAll(data) {
  for (const c of sseClients) c.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Week / Date helpers ───────────────────────────────────────
function getWeekStr(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const wn = 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${date.getFullYear()}-W${String(wn).padStart(2, '0')}`;
}
function getTodayStr() { return new Date().toISOString().slice(0, 10); }
function daysSince(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86400000);
}

// ── Score computation ─────────────────────────────────────────
function avg(rows, key) {
  const vals = rows.map(r => r[key]).filter(v => v != null && v !== 0 || v === 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 5;
}

function computeScores(checkins) {
  if (!checkins.length) return { global: 0, recuperation: 0, discipline: 0, stress: 0, jours: 0 };
  const last7 = checkins.slice(0, 7);

  const energie = avg(last7, 'energie');
  const motivation = avg(last7, 'motivation');
  const digestion = avg(last7, 'digestion');
  const sommeil = avg(last7, 'sommeil_qualite');
  const stress = avg(last7, 'stress');
  const hydratation = avg(last7, 'hydratation');
  const nutrition = avg(last7, 'respect_nutrition');

  const protocolRate = (last7.filter(r => r.protocol_done).length / last7.length) * 10;
  const trainingRate = (last7.filter(r => r.training_done).length / last7.length) * 10;

  const global = +((energie + motivation + digestion + sommeil + hydratation + (10 - stress)) / 6).toFixed(1);
  const recuperation = +((sommeil + (10 - stress) + energie) / 3).toFixed(1);
  const discipline = +((protocolRate + trainingRate + nutrition) / 3).toFixed(1);
  const stressScore = +(10 - stress).toFixed(1);

  return { global, recuperation, discipline, stress: stressScore, jours: last7.length };
}

// ── Alert detection ───────────────────────────────────────────
function computeAlerts(checkins, lastCheckinDate) {
  const alerts = [];
  if (!checkins.length || daysSince(lastCheckinDate) >= 3) {
    alerts.push({ type: 'decrochage', level: 'danger', icon: '🚨', message: 'Aucun check-in depuis 3+ jours' });
    return alerts;
  }
  const last3 = checkins.slice(0, 3);
  const last7 = checkins.slice(0, 7);

  if (last3.length >= 3 && last3.every(r => (r.energie || 5) <= 4))
    alerts.push({ type: 'energie', level: 'warning', icon: '⚡', message: 'Énergie basse 3 jours de suite' });

  if (last3.length >= 3 && last3.every(r => (r.stress || 5) >= 7))
    alerts.push({ type: 'stress', level: 'warning', icon: '🔴', message: 'Stress élevé 3 jours de suite' });

  if (last3.length >= 3 && last3.every(r => (r.sommeil_qualite || 5) <= 4))
    alerts.push({ type: 'sommeil', level: 'warning', icon: '😴', message: 'Mauvais sommeil 3 jours de suite' });

  if (last7.filter(r => r.motivation <= 4).length >= 4)
    alerts.push({ type: 'motivation', level: 'info', icon: '📉', message: 'Motivation basse (4+ jours/semaine)' });

  if (last7.filter(r => !r.protocol_done).length >= 4)
    alerts.push({ type: 'discipline', level: 'warning', icon: '❌', message: 'Protocole non suivi 4+ jours' });

  if (last7.filter(r => r.fringales).length >= 4)
    alerts.push({ type: 'fringales', level: 'info', icon: '🍫', message: 'Fringales répétées cette semaine' });

  if (last3.length >= 3 && last3.every(r => (r.digestion || 5) <= 4))
    alerts.push({ type: 'digestion', level: 'info', icon: '🔄', message: 'Digestion perturbée 3 jours' });

  return alerts;
}

// ── Coach default ─────────────────────────────────────────────
function ensureCoach() {
  const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('coach');
  if (!existing) {
    const { hash, salt } = hashPassword(process.env.COACH_PASSWORD || 'GregCoach2026');
    const email = process.env.COACH_EMAIL || 'gregvong.coaching@gmail.com';
    db.prepare('INSERT INTO users (email, password_hash, salt, name, role) VALUES (?, ?, ?, ?, ?)').run(email, hash, salt, 'Greg Vong', 'coach');
    console.log(`Coach créé : ${email}`);
  }
}

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
if (isProd) app.use('/uploads', express.static(uploadDir));

// ════════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════════

app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Champs manquants' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  try {
    const { hash, salt } = hashPassword(password);
    db.prepare('INSERT INTO users (email, password_hash, salt, name) VALUES (?, ?, ?, ?)').run(email.toLowerCase().trim(), hash, salt, name.trim());
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    const token = createSession(user.id);
    notifyAll({ type: 'new_client', name: name.trim() });
    res.json({ token, name: name.trim(), role: 'client' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email déjà utilisé' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Champs manquants' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  try {
    if (!verifyPassword(password, user.password_hash, user.salt)) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    const token = createSession(user.id);
    res.json({ token, name: user.name, role: user.role });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(getToken(req));
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });
  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email.toLowerCase().trim());
  // Toujours répondre OK pour ne pas révéler si l'email existe
  if (!user) return res.json({ success: true });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expires);

  const baseUrl = process.env.BASE_URL || 'https://coaching-app-production-6040.up.railway.app';
  const resetLink = `${baseUrl}/reset-password?token=${token}`;
  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: email.toLowerCase().trim(),
        subject: '🔐 Réinitialisation de ton mot de passe – GREGVONG COACHING',
        html: `
          <div style="font-family:sans-serif;background:#0D0B16;color:#F0EFF8;padding:40px;border-radius:16px;max-width:480px;margin:auto">
            <div style="color:#00D4B4;font-weight:800;font-size:20px;margin-bottom:8px">GREGVONG COACHING</div>
            <h2 style="font-size:22px;margin-bottom:16px">Réinitialisation du mot de passe</h2>
            <p style="color:#7B7A90;margin-bottom:24px">Bonjour ${user.name},<br/><br/>Tu as demandé à réinitialiser ton mot de passe. Clique sur le bouton ci-dessous :</p>
            <a href="${resetLink}" style="display:inline-block;background:#00D4B4;color:#0D0B16;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px">Réinitialiser mon mot de passe →</a>
            <p style="color:#7B7A90;font-size:12px;margin-top:24px">Ce lien expire dans <strong>1 heure</strong>.<br/>Si tu n'as pas demandé cette réinitialisation, ignore cet email.</p>
          </div>
        `
      })
    }).catch(console.error);
  }
  res.json({ success: true });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 6) return res.status(400).json({ error: 'Données invalides' });

  const reset = db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0').get(token);
  if (!reset) return res.status(400).json({ error: 'Lien invalide ou expiré' });
  if (new Date(reset.expires_at) < new Date()) return res.status(400).json({ error: 'Lien expiré' });

  const { hash, salt } = hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, reset.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(reset.user_id);

  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════
// CLIENT ROUTES
// ════════════════════════════════════════════════════════════

app.get('/api/client/today', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const today = getTodayStr();
  const checkin = db.prepare('SELECT * FROM daily_checkins WHERE client_id = ? AND date = ?').get(user.id, today);
  res.json({ date: today, checkin: checkin || null });
});

app.post('/api/client/daily', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(req.user.email);
  const today = getTodayStr();
  const {
    energie, motivation, digestion, fierte, stress,
    sommeil_qualite, sommeil_heure_coucher, sommeil_heure_reveil,
    training_done, training_type, training_duree, training_intensite,
    hydratation, respect_nutrition, fringales, pas,
    protocol_done, affirmation, ressenti
  } = req.body;
  try {
    db.prepare(`INSERT INTO daily_checkins
      (client_id, date, energie, motivation, digestion, fierte, stress,
       sommeil_qualite, sommeil_heure_coucher, sommeil_heure_reveil,
       training_done, training_type, training_duree, training_intensite,
       hydratation, respect_nutrition, fringales, pas,
       protocol_done, affirmation, ressenti)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(client_id, date) DO UPDATE SET
        energie=excluded.energie, motivation=excluded.motivation,
        digestion=excluded.digestion, fierte=excluded.fierte, stress=excluded.stress,
        sommeil_qualite=excluded.sommeil_qualite,
        sommeil_heure_coucher=excluded.sommeil_heure_coucher,
        sommeil_heure_reveil=excluded.sommeil_heure_reveil,
        training_done=excluded.training_done, training_type=excluded.training_type,
        training_duree=excluded.training_duree, training_intensite=excluded.training_intensite,
        hydratation=excluded.hydratation, respect_nutrition=excluded.respect_nutrition,
        fringales=excluded.fringales, pas=excluded.pas,
        protocol_done=excluded.protocol_done,
        affirmation=excluded.affirmation, ressenti=excluded.ressenti`
    ).run(
      user.id, today,
      energie || 5, motivation || 5, digestion || 5, fierte || 5, stress || 5,
      sommeil_qualite || 5, sommeil_heure_coucher || '', sommeil_heure_reveil || '',
      training_done ? 1 : 0, training_type || '', training_duree || 0, training_intensite || 5,
      hydratation || 5, respect_nutrition || 5, fringales ? 1 : 0, pas || 0,
      protocol_done ? 1 : 0, affirmation || '', ressenti || ''
    );
    notifyAll({ type: 'daily_checkin', client_name: user.name, date: today, energie, motivation, stress });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  }
});

app.get('/api/client/history', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const rows = db.prepare('SELECT * FROM daily_checkins WHERE client_id = ? ORDER BY date DESC LIMIT 30').all(user.id);
  res.json(rows);
});

app.get('/api/client/scores', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const checkins = db.prepare('SELECT * FROM daily_checkins WHERE client_id = ? ORDER BY date DESC LIMIT 7').all(user.id);
  res.json(computeScores(checkins));
});

async function sendWeeklyBilanEmail(clientName, week, d) {
  const resendKey = process.env.RESEND_API_KEY;
  const coachEmail = process.env.COACH_EMAIL || 'gregvong.coaching@gmail.com';
  if (!resendKey) return;

  const row = (label, value) => value != null && value !== '' ? `
    <tr>
      <td style="padding:8px 12px;color:#7B7A90;font-size:13px;width:55%">${label}</td>
      <td style="padding:8px 12px;color:#F0EFF8;font-size:13px;font-weight:700">${value}</td>
    </tr>` : '';

  const html = `
  <div style="font-family:sans-serif;background:#0D0B16;color:#F0EFF8;padding:32px;border-radius:12px;max-width:600px;margin:auto">
    <div style="color:#00D4B4;font-weight:800;font-size:16px;letter-spacing:2px;margin-bottom:4px">GREGVONG COACHING</div>
    <div style="font-size:22px;font-weight:900;margin-bottom:4px">📋 Bilan hebdo reçu</div>
    <div style="color:#7B7A90;font-size:13px;margin-bottom:24px">Semaine ${week} — ${clientName}</div>

    <div style="background:#13111E;border-radius:10px;padding:4px;margin-bottom:16px">
      <div style="color:#00D4B4;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;padding:12px 12px 4px">Mesures corporelles</div>
      <table style="width:100%;border-collapse:collapse">
        ${row('Poids (kg)', d.poids)}
        ${row('Masse grasse (%)', d.masse_grasse)}
        ${row('Tour de taille (cm)', d.tour_taille)}
        ${row('Tour de hanches (cm)', d.tour_hanches)}
        ${row('Bras gauche (cm)', d.tour_bras_g)}
        ${row('Bras droit (cm)', d.tour_bras_d)}
        ${row('Cuisse gauche (cm)', d.tour_cuisse_g)}
        ${row('Cuisse droite (cm)', d.tour_cuisse_d)}
        ${row('Mollet (cm)', d.tour_mollet)}
        ${row('Poitrine (cm)', d.tour_poitrine)}
        ${row('Séances réalisées', d.entrainements)}
      </table>
    </div>

    ${d.victoires ? `<div style="background:#13111E;border-radius:10px;padding:16px;margin-bottom:12px">
      <div style="color:#00D4B4;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Victoires de la semaine</div>
      <div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${d.victoires}</div>
    </div>` : ''}

    ${d.difficultes ? `<div style="background:#13111E;border-radius:10px;padding:16px;margin-bottom:12px">
      <div style="color:#F59E0B;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Difficultés rencontrées</div>
      <div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${d.difficultes}</div>
    </div>` : ''}

    ${d.notes ? `<div style="background:#13111E;border-radius:10px;padding:16px;margin-bottom:12px">
      <div style="color:#A78BFA;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Note pour le coach</div>
      <div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${d.notes}</div>
    </div>` : ''}

    <div style="margin-top:20px;font-size:12px;color:#7B7A90;text-align:center">
      GREGVONG COACHING — Bilan automatique
    </div>
  </div>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: coachEmail,
      subject: `📋 Bilan hebdo ${week} — ${clientName}`,
      html
    })
  }).catch(err => console.error('Erreur email bilan:', err.message));
}

app.post('/api/client/weekly', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(req.user.email);
  const week = getWeekStr();
  const { poids, masse_grasse, tour_taille, tour_hanches, tour_bras_g, tour_bras_d, tour_cuisse_g, tour_cuisse_d, tour_mollet, tour_poitrine, entrainements, victoires, difficultes, notes } = req.body;
  try {
    db.prepare(`INSERT INTO weekly_checkins
      (client_id, week, poids, masse_grasse, tour_taille, tour_hanches, tour_bras_g, tour_bras_d,
       tour_cuisse_g, tour_cuisse_d, tour_mollet, tour_poitrine, entrainements, victoires, difficultes, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(client_id, week) DO UPDATE SET
        poids=excluded.poids, masse_grasse=excluded.masse_grasse,
        tour_taille=excluded.tour_taille, tour_hanches=excluded.tour_hanches,
        tour_bras_g=excluded.tour_bras_g, tour_bras_d=excluded.tour_bras_d,
        tour_cuisse_g=excluded.tour_cuisse_g, tour_cuisse_d=excluded.tour_cuisse_d,
        tour_mollet=excluded.tour_mollet, tour_poitrine=excluded.tour_poitrine,
        entrainements=excluded.entrainements, victoires=excluded.victoires,
        difficultes=excluded.difficultes, notes=excluded.notes`
    ).run(user.id, week,
      poids ?? null, masse_grasse ?? null, tour_taille ?? null, tour_hanches ?? null,
      tour_bras_g ?? null, tour_bras_d ?? null, tour_cuisse_g ?? null, tour_cuisse_d ?? null,
      tour_mollet ?? null, tour_poitrine ?? null, entrainements ?? null,
      victoires || '', difficultes || '', notes || '');
    notifyAll({ type: 'weekly_checkin', client_name: user.name, week });
    sendWeeklyBilanEmail(user.name, week, { poids, masse_grasse, tour_taille, tour_hanches, tour_bras_g, tour_bras_d, tour_cuisse_g, tour_cuisse_d, tour_mollet, tour_poitrine, entrainements, victoires, difficultes, notes });
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur weekly bilan:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/client/weekly', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const rows = db.prepare('SELECT * FROM weekly_checkins WHERE client_id = ? ORDER BY week DESC LIMIT 12').all(user.id);
  res.json(rows);
});

app.post('/api/client/photos', requireAuth, upload.array('photos', 3), (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const week = getWeekStr();
  const types = req.body.types ? (Array.isArray(req.body.types) ? req.body.types : [req.body.types]) : [];
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Aucune photo' });
  req.files.forEach((file, i) => {
    db.prepare('INSERT INTO progress_photos (client_id, week, filename, type) VALUES (?, ?, ?, ?)').run(user.id, week, file.filename, types[i] || 'front');
  });
  res.json({ success: true, count: req.files.length });
});

app.get('/api/client/photos', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  res.json(db.prepare('SELECT * FROM progress_photos WHERE client_id = ? ORDER BY created_at DESC').all(user.id));
});

app.post('/api/client/meal-photos', requireAuth, upload.single('photo'), (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const date = getTodayStr();
  const meal_type = req.body.meal_type || 'repas';
  if (!req.file) return res.status(400).json({ error: 'Aucune photo' });
  db.prepare('INSERT INTO meal_photos (client_id, date, filename, meal_type) VALUES (?, ?, ?, ?)').run(user.id, date, req.file.filename, meal_type);
  notifyAll({ type: 'meal_photo', client_name: user.name, meal_type });
  res.json({ success: true, filename: req.file.filename });
});

app.get('/api/client/meal-photos', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  res.json(db.prepare('SELECT * FROM meal_photos WHERE client_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id));
});

app.get('/api/coach/client/:id/meal-photos', requireCoach, (req, res) => {
  res.json(db.prepare('SELECT * FROM meal_photos WHERE client_id = ? ORDER BY created_at DESC LIMIT 30').all(req.params.id));
});

// ════════════════════════════════════════════════════════════
// COACH ROUTES
// ════════════════════════════════════════════════════════════

app.get('/api/coach/clients', requireCoach, (req, res) => {
  const today = getTodayStr();
  const clients = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at, u.objectif,
      d.energie, d.motivation, d.digestion, d.fierte, d.stress,
      d.sommeil_qualite, d.training_done, d.protocol_done,
      d.hydratation, d.respect_nutrition, d.fringales, d.ressenti,
      (SELECT date FROM daily_checkins WHERE client_id = u.id ORDER BY date DESC LIMIT 1) as last_checkin
    FROM users u
    LEFT JOIN daily_checkins d ON d.client_id = u.id AND d.date = ?
    WHERE u.role = 'client'
    ORDER BY u.name
  `).all(today);

  const coachUser = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const result = clients.map(c => {
    const checkins = db.prepare('SELECT * FROM daily_checkins WHERE client_id = ? ORDER BY date DESC LIMIT 7').all(c.id);
    const scores = computeScores(checkins);
    const alerts = computeAlerts(checkins, c.last_checkin);
    const unread = db.prepare('SELECT COUNT(*) as n FROM messages WHERE to_id = ? AND from_id = ? AND read_at IS NULL').get(coachUser.id, c.id).n;
    return { ...c, scores, alerts, unread_messages: unread };
  });

  res.json(result);
});

app.get('/api/coach/alerts', requireCoach, (req, res) => {
  const clients = db.prepare('SELECT id, name FROM users WHERE role = ?').all('client');
  const allAlerts = [];
  for (const c of clients) {
    const checkins = db.prepare('SELECT * FROM daily_checkins WHERE client_id = ? ORDER BY date DESC LIMIT 7').all(c.id);
    const last = checkins[0];
    const alerts = computeAlerts(checkins, last?.date);
    for (const a of alerts) allAlerts.push({ ...a, client_id: c.id, client_name: c.name });
  }
  allAlerts.sort((a, b) => (a.level === 'danger' ? -1 : b.level === 'danger' ? 1 : 0));
  res.json(allAlerts);
});

app.get('/api/coach/client/:id', requireCoach, (req, res) => {
  const client = db.prepare('SELECT id, name, email, created_at, objectif FROM users WHERE id = ? AND role = ?').get(req.params.id, 'client');
  if (!client) return res.status(404).json({ error: 'Client introuvable' });
  const daily = db.prepare('SELECT * FROM daily_checkins WHERE client_id = ? ORDER BY date DESC LIMIT 60').all(client.id);
  const weekly = db.prepare('SELECT * FROM weekly_checkins WHERE client_id = ? ORDER BY week DESC LIMIT 12').all(client.id);
  const photos = db.prepare('SELECT * FROM progress_photos WHERE client_id = ? ORDER BY created_at DESC').all(client.id);
  const mealPhotos = db.prepare('SELECT * FROM meal_photos WHERE client_id = ? ORDER BY created_at DESC LIMIT 30').all(client.id);
  const notes = db.prepare('SELECT * FROM coach_notes WHERE client_id = ? ORDER BY created_at DESC').all(client.id);
  const scores = computeScores(daily);
  const alerts = computeAlerts(daily, daily[0]?.date);
  res.json({ client, daily, weekly, photos, mealPhotos, notes, scores, alerts });
});

// Créer un nouveau client depuis le dashboard
app.post('/api/coach/create-client', requireCoach, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères min)' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email déjà utilisé' });
  const { hash, salt } = hashPassword(password);
  db.prepare('INSERT INTO users (email, password_hash, salt, name, role) VALUES (?, ?, ?, ?, ?)').run(email, hash, salt, name, 'client');
  notifyAll({ type: 'new_client', client_name: name });

  // Email de bienvenue
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', to: email,
        subject: `🎉 Bienvenue dans ton espace coaching REBORN, ${name} !`,
        html: `<div style="font-family:sans-serif;background:#0D0B16;color:#F0EFF8;padding:32px;border-radius:12px;max-width:560px;margin:auto">
          <div style="color:#00D4B4;font-weight:800;font-size:18px;margin-bottom:4px">GREGVONG COACHING</div>
          <div style="font-size:24px;font-weight:900;margin-bottom:16px">Bienvenue ${name} ! 🎉</div>
          <p style="color:#ccc;font-size:14px;line-height:1.7;margin-bottom:20px">
            Ton espace personnel est prêt. Greg a préparé un suivi sur-mesure pour toi dans la <strong style="color:#fff">Méthode REBORN</strong>.
          </p>
          <div style="background:#13111E;border-radius:12px;padding:20px;margin-bottom:24px">
            <div style="font-size:12px;color:#7B7A90;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Tes accès</div>
            <div style="margin-bottom:6px"><span style="color:#7B7A90;font-size:13px">Email :</span> <strong style="font-size:13px">${email}</strong></div>
            <div><span style="color:#7B7A90;font-size:13px">Mot de passe :</span> <strong style="font-size:13px">${password}</strong></div>
          </div>
          <a href="https://coaching-app-production-6040.up.railway.app/login" style="display:block;background:#00D4B4;color:#050505;padding:16px;border-radius:12px;text-decoration:none;font-weight:800;font-size:15px;text-align:center;margin-bottom:16px">
            Accéder à mon espace →
          </a>
          <p style="font-size:12px;color:#7B7A90;text-align:center">💡 Ajoute l'app sur ton écran d'accueil pour un accès rapide</p>
        </div>`
      })
    }).catch(console.error);
  }
  res.json({ success: true });
});

// Stats globales coach
app.get('/api/coach/stats', requireCoach, (req, res) => {
  const today = getTodayStr();
  const clients = db.prepare("SELECT id, name, created_at FROM users WHERE role = 'client'").all();
  const totalClients = clients.length;
  let checkedInToday = 0, totalCheckins = 0, totalTrainings = 0, totalEnergy = 0, energyCount = 0;
  const inactif = [];

  for (const c of clients) {
    const todayRow = db.prepare('SELECT energie FROM daily_checkins WHERE client_id = ? AND date = ?').get(c.id, today);
    if (todayRow) checkedInToday++;
    const allCheckins = db.prepare('SELECT energie, training_done FROM daily_checkins WHERE client_id = ?').all(c.id);
    totalCheckins += allCheckins.length;
    totalTrainings += allCheckins.filter(r => r.training_done).length;
    allCheckins.forEach(r => { if (r.energie) { totalEnergy += r.energie; energyCount++; } });
    const last = db.prepare('SELECT date FROM daily_checkins WHERE client_id = ? ORDER BY date DESC LIMIT 1').get(c.id);
    const daysSince = last ? Math.floor((Date.now() - new Date(last.date + 'T12:00').getTime()) / 86400000) : 999;
    if (daysSince >= 3) inactif.push({ id: c.id, name: c.name, daysSince, lastCheckin: last ? last.date : null });
  }

  const adherence = totalClients > 0 ? Math.round(checkedInToday / totalClients * 100) : 0;
  const avgEnergy = energyCount > 0 ? (totalEnergy / energyCount).toFixed(1) : '–';

  res.json({ totalClients, checkedInToday, adherence, totalCheckins, totalTrainings, avgEnergy, inactif: inactif.sort((a,b) => b.daysSince - a.daysSince) });
});

app.post('/api/coach/client/:id/note', requireCoach, (req, res) => {
  const { note } = req.body;
  if (!note) return res.status(400).json({ error: 'Note vide' });
  db.prepare('INSERT INTO coach_notes (client_id, note) VALUES (?, ?)').run(req.params.id, note);
  res.json({ success: true });
});

app.post('/api/coach/client/:id/reset-password', requireCoach, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court' });
  const { hash, salt } = hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ? AND role = ?').run(hash, salt, req.params.id, 'client');
  res.json({ success: true });
});

app.delete('/api/coach/client/:id', requireCoach, (req, res) => {
  const id = req.params.id;
  db.prepare('DELETE FROM daily_checkins WHERE client_id = ?').run(id);
  db.prepare('DELETE FROM weekly_checkins WHERE client_id = ?').run(id);
  db.prepare('DELETE FROM progress_photos WHERE client_id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM coach_notes WHERE client_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ? AND role = ?').run(id, 'client');
  res.json({ success: true });
});

app.get('/uploads/:filename', (req, res) => {
  const file = path.join(uploadDir, path.basename(req.params.filename));
  if (fs.existsSync(file)) res.sendFile(file);
  else res.status(404).send('Not found');
});

app.get('/api/debug/photos', (req, res) => {
  const mealPhotos = db.prepare('SELECT m.*, u.name FROM meal_photos m JOIN users u ON u.id = m.client_id ORDER BY m.created_at DESC LIMIT 20').all();
  const uploads = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];
  res.json({ isProd, uploadDir, mealPhotosCount: mealPhotos.length, mealPhotos, uploadsFiles: uploads.length });
});

// ── Export complet données (JSON téléchargeable) ──────────────
app.get('/api/coach/export', requireCoach, (req, res) => {
  const clients = db.prepare('SELECT id, name, email, created_at, objectif FROM users WHERE role = ?').all('client');
  const data = clients.map(c => ({
    client: c,
    daily_checkins: db.prepare('SELECT * FROM daily_checkins WHERE client_id = ? ORDER BY date DESC').all(c.id),
    weekly_checkins: db.prepare('SELECT * FROM weekly_checkins WHERE client_id = ? ORDER BY week DESC').all(c.id),
    photos: db.prepare('SELECT * FROM progress_photos WHERE client_id = ? ORDER BY created_at DESC').all(c.id),
    notes: db.prepare('SELECT * FROM coach_notes WHERE client_id = ? ORDER BY created_at DESC').all(c.id),
  }));
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="backup-gvc-${date}.json"`);
  res.json({ exported_at: new Date().toISOString(), total_clients: clients.length, data });
});

// ── Sauvegarde automatique quotidienne par email ──────────────
async function sendDailyBackup() {
  const resendKey = process.env.RESEND_API_KEY;
  const coachEmail = process.env.COACH_EMAIL || 'gregvong.coaching@gmail.com';
  if (!resendKey) return;

  const clients = db.prepare('SELECT id, name, email, created_at FROM users WHERE role = ?').all('client');
  const date = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  let html = `
    <div style="font-family:sans-serif;background:#0D0B16;color:#F0EFF8;padding:32px;border-radius:12px;max-width:600px;margin:auto">
      <div style="color:#00D4B4;font-weight:800;font-size:18px;margin-bottom:4px">GREGVONG COACHING</div>
      <div style="font-size:22px;font-weight:900;margin-bottom:4px">💾 Sauvegarde quotidienne</div>
      <div style="color:#7B7A90;font-size:13px;margin-bottom:24px">${date}</div>
      <div style="background:#13111E;border-radius:10px;padding:16px;margin-bottom:20px">
        <div style="font-size:13px;color:#7B7A90;margin-bottom:8px">Résumé</div>
        <div style="font-size:20px;font-weight:900;color:#00D4B4">${clients.length} clients actifs</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="color:#7B7A90;border-bottom:1px solid #252336">
          <th style="text-align:left;padding:8px 0">Client</th>
          <th style="text-align:center;padding:8px 0">Check-ins</th>
          <th style="text-align:center;padding:8px 0">Bilans</th>
          <th style="text-align:center;padding:8px 0">Dernier check-in</th>
        </tr>
  `;

  for (const c of clients) {
    const checkinCount = db.prepare('SELECT COUNT(*) as n FROM daily_checkins WHERE client_id = ?').get(c.id).n;
    const weeklyCount  = db.prepare('SELECT COUNT(*) as n FROM weekly_checkins WHERE client_id = ?').get(c.id).n;
    const lastCheckin  = db.prepare('SELECT date FROM daily_checkins WHERE client_id = ? ORDER BY date DESC LIMIT 1').get(c.id);
    const daysSince    = lastCheckin ? Math.floor((Date.now() - new Date(lastCheckin.date).getTime()) / 86400000) : '–';
    const color        = typeof daysSince === 'number' && daysSince >= 3 ? '#FF4D6D' : '#F0EFF8';
    html += `
      <tr style="border-bottom:1px solid #1C1A2A">
        <td style="padding:8px 0;font-weight:700">${c.name}</td>
        <td style="text-align:center;padding:8px 0;color:#00D4B4">${checkinCount}</td>
        <td style="text-align:center;padding:8px 0;color:#00D4B4">${weeklyCount}</td>
        <td style="text-align:center;padding:8px 0;color:${color}">${lastCheckin ? `il y a ${daysSince}j` : 'Jamais'}</td>
      </tr>`;
  }

  html += `
      </table>
      <div style="margin-top:24px;padding:16px;background:#13111E;border-radius:10px;font-size:12px;color:#7B7A90">
        💾 Toutes les données sont sauvegardées sur le volume Railway sécurisé.<br/>
        Pour télécharger une sauvegarde complète : connecte-toi sur ton dashboard coach.
      </div>
    </div>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: coachEmail,
      subject: `💾 Sauvegarde GV Coaching – ${clients.length} clients – ${new Date().toLocaleDateString('fr-FR')}`,
      html
    })
  }).catch(console.error);

  console.log(`[BACKUP] Email de sauvegarde envoyé à ${coachEmail}`);
}

// Lance la sauvegarde quotidienne à minuit
function scheduleDailyBackup() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight - now;
  setTimeout(() => {
    sendDailyBackup();
    setInterval(sendDailyBackup, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
  console.log(`[BACKUP] Prochaine sauvegarde dans ${Math.round(msUntilMidnight/3600000)}h`);
}

// ── Cycle helpers ─────────────────────────────────────────────
function getCyclePhase(lastPeriodStart, cycleLength = 28, periodDuration = 5) {
  const today = new Date();
  const start = new Date(lastPeriodStart + 'T12:00:00');
  const daysSince = Math.floor((today - start) / 86400000);
  if (daysSince < 0) return null;
  const jourCycle = (daysSince % cycleLength) + 1;
  const follEnd = Math.round(cycleLength * 12 / 28);
  const ovEnd   = Math.round(cycleLength * 17 / 28);
  let phase;
  if (jourCycle <= periodDuration)    phase = 'menstruelle';
  else if (jourCycle <= follEnd)       phase = 'folliculaire';
  else if (jourCycle <= ovEnd)         phase = 'ovulatoire';
  else                                  phase = 'luteale';
  const phaseEnds = { menstruelle: periodDuration, folliculaire: follEnd, ovulatoire: ovEnd, luteale: cycleLength };
  const phaseDaysLeft = phaseEnds[phase] - jourCycle + 1;
  return { phase, jourCycle, cycleLength, periodDuration, follEnd, ovEnd, phaseDaysLeft };
}

// ── Cycle routes ──────────────────────────────────────────────
app.get('/api/client/cycle', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  if (!user) return res.json({ configured: false });
  const settings = db.prepare('SELECT * FROM cycle_settings WHERE user_id = ?').get(user.id);
  if (!settings) return res.json({ configured: false });
  const phaseInfo = getCyclePhase(settings.last_period_start, settings.cycle_length, settings.period_duration);
  if (!phaseInfo) return res.json({ configured: false });
  const today = getTodayStr();
  const todayLog = db.prepare('SELECT * FROM cycle_logs WHERE user_id = ? AND date = ?').get(user.id, today);
  const history = db.prepare('SELECT * FROM cycle_logs WHERE user_id = ? ORDER BY date DESC LIMIT 90').all(user.id);
  res.json({ configured: true, settings, phaseInfo, todayLog: todayLog || null, history });
});

app.post('/api/client/cycle/setup', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  const { last_period_start, cycle_length, period_duration } = req.body;
  if (!last_period_start) return res.status(400).json({ error: 'Date requise' });
  const cl = parseInt(cycle_length) || 28;
  const pd = parseInt(period_duration) || 5;
  db.prepare(`INSERT INTO cycle_settings (user_id, last_period_start, cycle_length, period_duration, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET last_period_start=excluded.last_period_start, cycle_length=excluded.cycle_length, period_duration=excluded.period_duration, updated_at=CURRENT_TIMESTAMP`
  ).run(user.id, last_period_start, cl, pd);
  const phaseInfo = getCyclePhase(last_period_start, cl, pd);
  res.json({ success: true, phaseInfo });
});

app.post('/api/client/cycle/log', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const settings = db.prepare('SELECT * FROM cycle_settings WHERE user_id = ?').get(user.id);
  if (!settings) return res.status(400).json({ error: 'Cycle non configuré' });
  const today = getTodayStr();
  const phaseInfo = getCyclePhase(settings.last_period_start, settings.cycle_length, settings.period_duration);
  const { energie, douleur, humeur, symptomes, notes } = req.body;
  db.prepare(`INSERT INTO cycle_logs (user_id, date, phase, jour_cycle, energie, douleur, humeur, symptomes, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET energie=excluded.energie, douleur=excluded.douleur, humeur=excluded.humeur, symptomes=excluded.symptomes, notes=excluded.notes`
  ).run(user.id, today, phaseInfo?.phase || '', phaseInfo?.jourCycle || 1,
    parseInt(energie) || 5, parseInt(douleur) || 0, parseInt(humeur) || 5,
    JSON.stringify(symptomes || []), notes || '');
  res.json({ success: true });
});

app.get('/api/coach/client/:id/cycle', requireCoach, (req, res) => {
  const uid = parseInt(req.params.id);
  const settings = db.prepare('SELECT * FROM cycle_settings WHERE user_id = ?').get(uid);
  if (!settings) return res.json({ configured: false });
  const phaseInfo = getCyclePhase(settings.last_period_start, settings.cycle_length, settings.period_duration);
  const history = db.prepare('SELECT * FROM cycle_logs WHERE user_id = ? ORDER BY date DESC LIMIT 60').all(uid);
  res.json({ configured: true, settings, phaseInfo, history });
});

// ── SSE ───────────────────────────────────────────────────────
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  sseClients.add(res);
  const hb = setInterval(() => res.write(': ping\n\n'), 30000);
  req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
});

// ════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ════════════════════════════════════════════════════════════

// Retourne la clé publique VAPID au client
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

// Enregistre ou met à jour la subscription push d'un utilisateur
app.post('/api/push/subscribe', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const sub = JSON.stringify(req.body);
  db.prepare(`INSERT INTO push_subscriptions (user_id, subscription) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET subscription = excluded.subscription`).run(user.id, sub);
  res.json({ success: true });
});

function sendPush(userId, payload) {
  const row = db.prepare('SELECT subscription FROM push_subscriptions WHERE user_id = ?').get(userId);
  if (!row) return;
  try {
    webpush.sendNotification(JSON.parse(row.subscription), JSON.stringify(payload)).catch(err => {
      if (err.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(userId);
      }
    });
  } catch (_) {}
}

// ════════════════════════════════════════════════════════════
// MESSAGERIE
// ════════════════════════════════════════════════════════════

function getCoachId() {
  const coach = db.prepare("SELECT id FROM users WHERE role = 'coach' LIMIT 1").get();
  return coach ? coach.id : null;
}

// Client envoie un message au coach
app.post('/api/messages', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(req.user.email);
  const coachId = getCoachId();
  if (!coachId) return res.status(500).json({ error: 'Coach introuvable' });
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message vide' });
  db.prepare('INSERT INTO messages (from_id, to_id, body) VALUES (?, ?, ?)').run(user.id, coachId, body.trim());
  notifyAll({ type: 'message', from: user.name, preview: body.trim().slice(0, 60) });
  // Push coach
  sendPush(coachId, { title: `💬 ${user.name}`, body: body.trim().slice(0, 80), url: '/coach' });
  // Email coach
  const resendKey = process.env.RESEND_API_KEY;
  const coachEmail = process.env.COACH_EMAIL || 'gregvong.coaching@gmail.com';
  if (resendKey) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', to: coachEmail,
        subject: `💬 Nouveau message de ${user.name}`,
        html: `<div style="font-family:sans-serif;padding:24px;background:#0D0B16;color:#F0EFF8;border-radius:12px;max-width:500px">
          <div style="color:#00D4B4;font-weight:800;font-size:16px;margin-bottom:12px">💬 Message de ${user.name}</div>
          <div style="background:#13111E;border-radius:10px;padding:16px;font-size:15px;line-height:1.6">${body.trim()}</div>
          <div style="margin-top:16px;font-size:12px;color:#7B7A90">Réponds depuis ton dashboard coach.</div>
        </div>`
      })
    }).catch(console.error);
  }
  res.json({ success: true });
});

// Client lit ses messages (avec coach)
app.get('/api/messages', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const coachId = getCoachId();
  if (!coachId) return res.json([]);
  const msgs = db.prepare(`
    SELECT m.*, u.name as from_name FROM messages m
    JOIN users u ON u.id = m.from_id
    WHERE (m.from_id = ? AND m.to_id = ?) OR (m.from_id = ? AND m.to_id = ?)
    ORDER BY m.created_at ASC
  `).all(user.id, coachId, coachId, user.id);
  // Marquer reçus comme lus
  db.prepare('UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE to_id = ? AND from_id = ? AND read_at IS NULL').run(user.id, coachId);
  res.json(msgs);
});

// Coach lit les messages d'un client
app.get('/api/coach/messages/:clientId', requireCoach, (req, res) => {
  const coach = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const clientId = parseInt(req.params.clientId);
  const msgs = db.prepare(`
    SELECT m.*, u.name as from_name FROM messages m
    JOIN users u ON u.id = m.from_id
    WHERE (m.from_id = ? AND m.to_id = ?) OR (m.from_id = ? AND m.to_id = ?)
    ORDER BY m.created_at ASC
  `).all(coach.id, clientId, clientId, coach.id);
  // Marquer comme lus
  db.prepare('UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE to_id = ? AND from_id = ? AND read_at IS NULL').run(coach.id, clientId);
  res.json(msgs);
});

// Coach envoie un message à un client
app.post('/api/coach/messages/:clientId', requireCoach, (req, res) => {
  const coach = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const clientId = parseInt(req.params.clientId);
  const client = db.prepare('SELECT id, name, email FROM users WHERE id = ? AND role = ?').get(clientId, 'client');
  if (!client) return res.status(404).json({ error: 'Client introuvable' });
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message vide' });
  db.prepare('INSERT INTO messages (from_id, to_id, body) VALUES (?, ?, ?)').run(coach.id, clientId, body.trim());
  notifyAll({ type: 'coach_message', to_id: clientId });
  // Push client
  sendPush(clientId, { title: '💬 Greg Vong', body: body.trim().slice(0, 80), url: '/client' });
  // Email client
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', to: client.email,
        subject: `💬 Nouveau message de ton coach Greg`,
        html: `<div style="font-family:sans-serif;padding:24px;background:#0D0B16;color:#F0EFF8;border-radius:12px;max-width:500px">
          <div style="color:#00D4B4;font-weight:800;font-size:16px;margin-bottom:12px">💬 Message de Greg Vong</div>
          <div style="background:#13111E;border-radius:10px;padding:16px;font-size:15px;line-height:1.6">${body.trim()}</div>
          <div style="margin-top:16px"><a href="https://coaching-app-production-6040.up.railway.app/client" style="background:#00D4B4;color:#050505;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">Répondre dans l'app</a></div>
        </div>`
      })
    }).catch(console.error);
  }
  res.json({ success: true });
});

// Compter messages non lus pour un client
app.get('/api/messages/unread', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const coachId = getCoachId();
  if (!coachId) return res.json({ count: 0 });
  const row = db.prepare('SELECT COUNT(*) as n FROM messages WHERE to_id = ? AND from_id = ? AND read_at IS NULL').get(user.id, coachId);
  res.json({ count: row.n });
});

// Compter messages non lus pour le coach (d'un client)
app.get('/api/coach/messages/:clientId/unread', requireCoach, (req, res) => {
  const coach = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  const row = db.prepare('SELECT COUNT(*) as n FROM messages WHERE to_id = ? AND from_id = ? AND read_at IS NULL').get(coach.id, parseInt(req.params.clientId));
  res.json({ count: row.n });
});

// ════════════════════════════════════════════════════════════
// OBJECTIFS
// ════════════════════════════════════════════════════════════

// Coach fixe un objectif
app.post('/api/coach/client/:id/goals', requireCoach, (req, res) => {
  const { type, label, target, note } = req.body;
  if (!type || !label) return res.status(400).json({ error: 'Type et label requis' });
  db.prepare('INSERT INTO goals (client_id, type, label, target, note) VALUES (?, ?, ?, ?, ?)').run(
    parseInt(req.params.id), type, label, target ?? null, note || ''
  );
  res.json({ success: true });
});

// Coach liste les objectifs d'un client
app.get('/api/coach/client/:id/goals', requireCoach, (req, res) => {
  res.json(db.prepare('SELECT * FROM goals WHERE client_id = ? ORDER BY created_at DESC').all(parseInt(req.params.id)));
});

// Coach supprime un objectif
app.delete('/api/coach/goals/:id', requireCoach, (req, res) => {
  db.prepare('DELETE FROM goals WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

// Client voit ses objectifs
app.get('/api/client/goals', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  res.json(db.prepare('SELECT * FROM goals WHERE client_id = ? ORDER BY created_at DESC').all(user.id));
});

// ════════════════════════════════════════════════════════════
// RAPPELS CHECK-IN
// ════════════════════════════════════════════════════════════

async function sendCheckinReminders() {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const today = getTodayStr();
  const clients = db.prepare(`
    SELECT u.id, u.name, u.email FROM users u
    WHERE u.role = 'client'
    AND NOT EXISTS (SELECT 1 FROM daily_checkins d WHERE d.client_id = u.id AND d.date = ?)
  `).all(today);
  for (const c of clients) {
    sendPush(c.id, {
      title: '⏰ Check-in du jour',
      body: `${c.name}, tu n'as pas encore fait ton check-in ! 2 minutes suffisent.`,
      url: '/client'
    });
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', to: c.email,
        subject: `⏰ ${c.name}, tu n'as pas encore fait ton check-in !`,
        html: `<div style="font-family:sans-serif;padding:24px;background:#0D0B16;color:#F0EFF8;border-radius:12px;max-width:500px">
          <div style="color:#00D4B4;font-weight:800;font-size:18px;margin-bottom:8px">GREGVONG COACHING</div>
          <div style="font-size:22px;font-weight:900;margin-bottom:16px">⏰ Check-in du jour</div>
          <p style="color:#ccc;font-size:14px;line-height:1.6;margin-bottom:20px">
            Bonjour ${c.name} 👋<br/><br/>
            Tu n'as pas encore fait ton check-in quotidien aujourd'hui. Ça prend 2 minutes et ça aide Greg à suivre ta progression !
          </p>
          <a href="https://coaching-app-production-6040.up.railway.app/client" style="display:inline-block;background:#00D4B4;color:#050505;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:800;font-size:14px">Faire mon check-in →</a>
        </div>`
      })
    }).catch(console.error);
  }
  if (clients.length > 0) console.log(`[RAPPELS] ${clients.length} rappels envoyés`);
}

function scheduleReminders() {
  const now = new Date();
  const next9h = new Date(now);
  next9h.setHours(9, 0, 0, 0);
  if (next9h <= now) next9h.setDate(next9h.getDate() + 1);
  const ms = next9h - now;
  setTimeout(() => {
    sendCheckinReminders();
    setInterval(sendCheckinReminders, 24 * 60 * 60 * 1000);
  }, ms);
  console.log(`[RAPPELS] Prochain rappel dans ${Math.round(ms/3600000)}h`);
}

// ════════════════════════════════════════════════════════════
// PROFIL CLIENT (streak, quote, scores comparaison)
// ════════════════════════════════════════════════════════════

function computeStreak(clientId) {
  const rows = db.prepare('SELECT date FROM daily_checkins WHERE client_id = ? ORDER BY date DESC').all(clientId);
  if (!rows.length) return 0;
  const today = getTodayStr();
  let streak = 0;
  let current = new Date(today + 'T12:00:00');
  for (const row of rows) {
    const d = new Date(row.date + 'T12:00:00');
    const diff = Math.round((current - d) / 86400000);
    if (diff === 0 || diff === 1) { streak++; current = d; }
    else break;
  }
  return streak;
}

function computeWeeklyAvg(clientId, weeksAgo = 0) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - start.getDay() + 1 - weeksAgo * 7);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const rows = db.prepare('SELECT energie, stress, sommeil_qualite, motivation FROM daily_checkins WHERE client_id = ? AND date >= ? AND date <= ?').all(clientId, startStr, endStr);
  if (!rows.length) return null;
  const avg = rows.reduce((s, r) => s + ((r.energie || 5) + (10 - (r.stress || 5)) + (r.sommeil_qualite || 5) + (r.motivation || 5)) / 4, 0) / rows.length;
  return Math.round(avg * 10) / 10;
}

app.get('/api/client/profile', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, quote, avatar FROM users WHERE email = ?').get(req.user.email);
  const streak = computeStreak(user.id);
  const weekScore = computeWeeklyAvg(user.id, 0);
  const prevScore = computeWeeklyAvg(user.id, 1);
  // Vérifier objectifs atteints
  const goals = db.prepare('SELECT * FROM goals WHERE client_id = ?').all(user.id);
  const last = db.prepare('SELECT * FROM weekly_checkins WHERE client_id = ? ORDER BY week DESC LIMIT 1').get(user.id);
  const achieved = goals.filter(g => {
    if (!last || g.target == null) return false;
    const val = last[g.type];
    if (val == null) return false;
    return val <= g.target;
  });
  res.json({ streak, weekScore, prevScore, quote: user.quote || '', avatar: user.avatar || '', achieved });
});

// Coach définit la citation motivante pour un client
app.put('/api/coach/client/:id/quote', requireCoach, (req, res) => {
  const { quote } = req.body;
  const clientId = parseInt(req.params.id);
  db.prepare('UPDATE users SET quote = ? WHERE id = ? AND role = ?').run(quote || '', clientId, 'client');
  if (quote) sendPush(clientId, { title: '💬 Message de ton coach', body: quote, url: '/client' });
  res.json({ success: true });
});

// Upload avatar client
app.post('/api/client/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  if (!req.file) return res.status(400).json({ error: 'Aucune image' });
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(req.file.filename, user.id);
  res.json({ success: true, filename: req.file.filename });
});

// ════════════════════════════════════════════════════════════
// RÉSUMÉ MENSUEL AUTOMATIQUE
// ════════════════════════════════════════════════════════════

async function sendMonthlyReports() {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const monthName = lastMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const startStr = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1).toISOString().slice(0, 10);
  const endStr = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).toISOString().slice(0, 10);

  const clients = db.prepare("SELECT id, name, email FROM users WHERE role = 'client'").all();
  for (const c of clients) {
    const checkins = db.prepare('SELECT * FROM daily_checkins WHERE client_id = ? AND date >= ? AND date <= ? ORDER BY date ASC').all(c.id, startStr, endStr);
    if (!checkins.length) continue;
    const avg = (k) => checkins.length ? (checkins.reduce((s, r) => s + (r[k] || 5), 0) / checkins.length).toFixed(1) : '–';
    const trainings = checkins.filter(r => r.training_done).length;
    const protocol = checkins.filter(r => r.protocol_done).length;
    const last = db.prepare('SELECT * FROM weekly_checkins WHERE client_id = ? ORDER BY week DESC LIMIT 1').get(c.id);

    const html = `<div style="font-family:sans-serif;background:#0D0B16;color:#F0EFF8;padding:32px;border-radius:12px;max-width:600px;margin:auto">
      <div style="color:#00D4B4;font-weight:800;font-size:18px;margin-bottom:4px">GREGVONG COACHING</div>
      <div style="font-size:22px;font-weight:900;margin-bottom:4px">📊 Ton bilan de ${monthName}</div>
      <div style="color:#7B7A90;font-size:13px;margin-bottom:24px">Bravo ${c.name} pour ce mois !</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
        <div style="background:#13111E;border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:24px;font-weight:900;color:#00D4B4">${checkins.length}</div>
          <div style="font-size:12px;color:#7B7A90">check-ins réalisés</div>
        </div>
        <div style="background:#13111E;border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:24px;font-weight:900;color:#00D4B4">${trainings}</div>
          <div style="font-size:12px;color:#7B7A90">séances d'entraînement</div>
        </div>
        <div style="background:#13111E;border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:24px;font-weight:900;color:#00D4B4">${avg('energie')}</div>
          <div style="font-size:12px;color:#7B7A90">énergie moyenne /10</div>
        </div>
        <div style="background:#13111E;border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:24px;font-weight:900;color:#00D4B4">${Math.round(protocol / checkins.length * 100)}%</div>
          <div style="font-size:12px;color:#7B7A90">protocole respecté</div>
        </div>
      </div>
      ${last?.poids ? `<div style="background:#13111E;border-radius:10px;padding:14px;margin-bottom:16px;text-align:center">
        <div style="font-size:13px;color:#7B7A90;margin-bottom:6px">Dernier poids enregistré</div>
        <div style="font-size:28px;font-weight:900;color:#00D4B4">${last.poids} kg</div>
      </div>` : ''}
      <a href="https://coaching-app-production-6040.up.railway.app/client" style="display:block;background:#00D4B4;color:#050505;padding:14px;border-radius:10px;text-decoration:none;font-weight:800;font-size:14px;text-align:center">Voir mon espace coaching →</a>
    </div>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'onboarding@resend.dev', to: c.email, subject: `📊 Ton bilan de ${monthName} — GREGVONG COACHING`, html })
    }).catch(console.error);
  }
  console.log(`[MENSUEL] Bilans envoyés à ${clients.length} clients`);
}

function scheduleMonthlyReports() {
  const now = new Date();
  const next1st = new Date(now.getFullYear(), now.getMonth() + 1, 1, 8, 0, 0, 0);
  const ms = next1st - now;
  setTimeout(() => {
    sendMonthlyReports();
    setInterval(sendMonthlyReports, 30 * 24 * 60 * 60 * 1000);
  }, ms);
  console.log(`[MENSUEL] Prochain bilan mensuel dans ${Math.round(ms / 3600000)}h`);
}

// ════════════════════════════════════════════════════════════
// PROGRAMMES
// ════════════════════════════════════════════════════════════

app.get('/api/coach/client/:id/programs', requireCoach, (req, res) => {
  res.json(db.prepare('SELECT * FROM programs WHERE client_id = ? ORDER BY created_at DESC').all(parseInt(req.params.id)));
});

app.post('/api/coach/client/:id/programs', requireCoach, (req, res) => {
  const { title, url } = req.body;
  if (!title || !url) return res.status(400).json({ error: 'Titre et lien requis' });
  db.prepare('INSERT INTO programs (client_id, title, url) VALUES (?, ?, ?)').run(parseInt(req.params.id), title, url);
  // Push client
  const clientId = parseInt(req.params.id);
  sendPush(clientId, { title: '📋 Nouveau programme disponible !', body: title, url: '/client' });
  res.json({ success: true });
});

app.delete('/api/coach/programs/:id', requireCoach, (req, res) => {
  db.prepare('DELETE FROM programs WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

app.get('/api/client/programs', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(req.user.email);
  res.json(db.prepare('SELECT * FROM programs WHERE client_id = ? ORDER BY created_at DESC').all(user.id));
});

// ── SPA routes (no-cache pour forcer le rechargement après déploiement) ──
const noCache = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
};
app.get('/login', noCache, (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', noCache, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/client', noCache, (req, res) => res.sendFile(path.join(__dirname, 'public', 'client.html')));
app.get('/coach', noCache, (req, res) => res.sendFile(path.join(__dirname, 'public', 'coach.html')));
app.get('/reset-password', noCache, (req, res) => res.sendFile(path.join(__dirname, 'public', 'reset-password.html')));
app.get('/cycle', noCache, (req, res) => res.sendFile(path.join(__dirname, 'public', 'cycle.html')));
app.get('/', (req, res) => res.redirect('/login'));

// ── Start ─────────────────────────────────────────────────────
ensureCoach();
scheduleDailyBackup();
scheduleReminders();
scheduleMonthlyReports();
app.listen(PORT, () => {
  console.log(`GREGVONG COACHING App → http://localhost:${PORT}`);
});
