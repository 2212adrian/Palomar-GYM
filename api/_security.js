import crypto from 'node:crypto';

export const CANONICAL_APP_URL = 'https://dev-wolfpalomar.vercel.app';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://dev-wolfpalomar.vercel.app',
  'https://wolfpalomar.vercel.app',
  'https://palomargym.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'capacitor://localhost',
  'http://localhost',
];

const getAllowedOrigins = (req) => {
  const configuredEnv = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const appUrl = String(process.env.VITE_APP_URL || process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');

  const allowlist = new Set(DEFAULT_ALLOWED_ORIGINS);
  for (const item of configuredEnv) allowlist.add(item);
  if (appUrl) allowlist.add(appUrl);

  // Also allow same-host origin (supports preview/custom domains cleanly without wildcard)
  const host = String(req?.headers?.host || '').trim().toLowerCase();
  if (host) {
    allowlist.add(`https://${host}`);
    allowlist.add(`http://${host}`);
  }

  return allowlist;
};

export const applySecurityCorsHeaders = (req, res) => {
  const origin = String(req?.headers?.origin || '').trim().replace(/\/+$/, '');
  const allowlist = getAllowedOrigins(req);

  if (origin && allowlist.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
};

export const resolveSafeAppUrl = (req) => {
  const configured = String(process.env.VITE_APP_URL || process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (configured) return configured;

  const origin = String(req?.headers?.origin || '').trim().replace(/\/+$/, '');
  const allowlist = getAllowedOrigins(req);
  if (origin && allowlist.has(origin) && !origin.includes('-projects.vercel.app')) {
    return origin;
  }

  return CANONICAL_APP_URL;
};

export const compareTokensConstantTime = (provided, expected) => {
  if (!provided || !expected) return false;
  const providedDigest = crypto.createHash('sha256').update(String(provided)).digest();
  const expectedDigest = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
};

export const verifyAdminCaller = async (req, supabaseAdmin) => {
  const authHeader = String(req?.headers?.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return { ok: false, status: 401, error: 'Please sign in first to run this admin action.' };
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return { ok: false, status: 401, error: 'Your sign-in session has expired. Please sign in again.' };
  }

  const callerEmail = String(user.email || '').trim().toLowerCase();
  const envSuperAdmin = String(
    process.env.SUPERADMIN_EMAIL || process.env.VITE_SUPERADMIN_EMAIL || 'wolf.palomar@gmail.com'
  )
    .trim()
    .toLowerCase();

  let dbSuperAdmin = '';
  try {
    const { data: cfg } = await supabaseAdmin
      .from('system_config')
      .select('value')
      .eq('key', 'superadmin_email')
      .maybeSingle();
    if (cfg?.value) {
      dbSuperAdmin = String(cfg.value).replace(/^"|"$/g, '').trim().toLowerCase();
    }
  } catch {
    // Non-fatal fallback
  }

  if (callerEmail && (callerEmail === envSuperAdmin || (dbSuperAdmin && callerEmail === dbSuperAdmin))) {
    return { ok: true, user, isSuperAdmin: true };
  }

  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profileRow) {
    return { ok: false, status: 403, error: 'Only active administrators can perform this action.' };
  }

  const isAdminRole = String(profileRow.role || '').toLowerCase() === 'admin';
  const isActiveStatus = String(profileRow.status || '').toLowerCase() === 'active';

  if (!isAdminRole || !isActiveStatus) {
    return { ok: false, status: 403, error: 'Only active administrators can perform this action.' };
  }

  return { ok: true, user, isSuperAdmin: false };
};
