// Banco de dados, autenticação e utilidades das funções da API.
import pg from "pg";
import crypto from "node:crypto";

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- Conexão ---------- */
export const SCHEMA = (() => {
  const v = String(process.env.DB_SCHEMA || "plataforma").trim().toLowerCase();
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(v)) throw new Error("DB_SCHEMA inválido");
  return v;
})();
export const T = { tenants: SCHEMA + ".tenants", quotes: SCHEMA + ".quotes" };

function connectionConfig() {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!raw) throw new HttpError(500, "Banco de dados não configurado: defina a variável DATABASE_URL na Vercel.");
  let url;
  try { url = new URL(raw); } catch { throw new HttpError(500, "DATABASE_URL inválida."); }
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  const local = /^(localhost|127\.0\.0\.1|::1)$/.test(url.hostname) || url.hostname.endsWith(".local");
  return { connectionString: url.toString(), ssl: local || sslmode === "disable" ? false : { rejectUnauthorized: false } };
}
// O Supabase usa servidores "aws-0-…" ou "aws-1-…" conforme o projeto; tentamos as variações.
function candidates(cfg) {
  const out = [cfg];
  try {
    const u = new URL(cfg.connectionString);
    const m = u.hostname.match(/^aws-(\d)-(.+\.pooler\.supabase\.com)$/);
    if (m) ["0", "1", "2"].filter((n) => n !== m[1]).forEach((n) => {
      const v = new URL(u.toString()); v.hostname = "aws-" + n + "-" + m[2];
      out.push({ ...cfg, connectionString: v.toString() });
    });
  } catch { /* ignora */ }
  return out;
}
let poolReady = null;
function getPool() {
  if (!poolReady) {
    poolReady = (async () => {
      let lastErr;
      for (const cfg of candidates(connectionConfig())) {
        const p = new pg.Pool({ ...cfg, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
        p.on("error", () => {});
        try { await p.query("select 1"); return p; }
        catch (e) {
          lastErr = e; p.end().catch(() => {});
          if (!/tenant or user not found|ENOTFOUND|EAI_AGAIN/i.test(String(e && e.message))) break;
        }
      }
      throw lastErr;
    })().catch((e) => { poolReady = null; throw e; });
  }
  return poolReady;
}

const SCHEMA_SQL = `
do $$ begin if not exists (select 1 from pg_namespace where nspname = '${SCHEMA}') then execute 'create schema ${SCHEMA}'; end if; end $$;
create table if not exists ${T.tenants} (
  id text primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'),
  nome text not null,
  ativo boolean not null default true,
  senha_hash text not null,
  token_version integer not null default 1,
  logo text,
  tema jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  criado_por text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ${T.quotes} (
  id text primary key,
  tenant_id text not null references ${T.tenants}(id) on delete cascade,
  numero integer,
  titulo text not null default '',
  cliente text not null default '',
  vendedor text not null default '',
  status text not null default 'aberto' check (status in ('aberto','fechou','perdeu')),
  motivo text not null default '',
  total_a numeric(14,2) not null default 0,
  total_b numeric(14,2),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, numero)
);
create index if not exists quotes_tenant_numero_idx on ${T.quotes} (tenant_id, numero desc);`;

let schemaReady = null;
export async function db() {
  const p = await getPool();
  if (!schemaReady) schemaReady = p.query(SCHEMA_SQL).catch((e) => { schemaReady = null; throw e; });
  await schemaReady;
  return p;
}
export async function tx(fn) {
  const client = await (await db()).connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    try { await client.query("rollback"); } catch { /* ignora */ }
    throw e;
  } finally { client.release(); }
}

/* ---------- Senhas e sessões ---------- */
function secret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const admin = process.env.ADMIN_PASSWORD;
  if (!admin) throw new HttpError(500, "Senha do painel não configurada: defina a variável ADMIN_PASSWORD na Vercel.");
  return crypto.createHash("sha256").update("qh4|" + admin + "|" + (process.env.DATABASE_URL || "")).digest("hex");
}
function hmac(v) { return crypto.createHmac("sha256", secret()).update(String(v)).digest("base64url"); }
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const h = crypto.scryptSync(String(pw), salt, 32).toString("base64url");
  return "s1$" + salt + "$" + h;
}
export function verifyPassword(pw, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "s1") return false;
  const h = crypto.scryptSync(String(pw || ""), parts[1], 32).toString("base64url");
  return safeEqual(h, parts[2]);
}
export function checkAdminPassword(pw) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) secret();
  const d = (v) => crypto.createHash("sha256").update(String(v || "")).digest("hex");
  return safeEqual(d(pw), d(expected));
}
const DAY = 86400000;
export function adminToken() { const p = "a." + (Date.now() + 14 * DAY); return p + "." + hmac(p); }
export function tenantToken(t) { const p = "t." + t.id + "." + t.token_version + "." + (Date.now() + 30 * DAY); return p + "." + hmac(p); }
function bearer(req) { return String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim(); }
function parseToken(tok) {
  const i = tok.lastIndexOf(".");
  if (i < 0) return null;
  const payload = tok.slice(0, i), sig = tok.slice(i + 1);
  if (!safeEqual(sig, hmac(payload))) return null;
  const parts = payload.split(".");
  if (!(Number(parts[parts.length - 1]) > Date.now())) return null;
  return parts;
}
export function requireAdmin(req) {
  const p = parseToken(bearer(req));
  if (!p || p[0] !== "a") throw new HttpError(401, "Sessão do painel expirada. Entre novamente.");
}
export async function requireTenant(req) {
  const p = parseToken(bearer(req));
  if (!p || p[0] !== "t" || p.length !== 4) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  const pool = await db();
  const { rows } = await pool.query(`select id, slug, nome, ativo, token_version from ${T.tenants} where id = $1`, [p[1]]);
  const t = rows[0];
  if (!t || String(t.token_version) !== p[2]) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  if (!t.ativo) throw new HttpError(403, "Este sistema está desativado. Fale com a QH4.");
  return t;
}

/* ---------- Respostas ---------- */
export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
export function readBody(req) {
  const b = req.body;
  if (b == null || b === "") return {};
  if (typeof b === "string" || Buffer.isBuffer(b)) {
    try { return JSON.parse(b.toString("utf8")); } catch { throw new HttpError(400, "JSON inválido."); }
  }
  return b;
}
export function q(req, k) { return req.query && req.query[k] != null ? String(req.query[k]) : ""; }
export function slow() { return new Promise((r) => setTimeout(r, 600)); }
export function handle(fn) {
  return async function handler(req, res) {
    try { await fn(req, res); }
    catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(e);
      const msg = e instanceof HttpError ? e.message :
        /ECONNREFUSED|ENOTFOUND|password authentication|timeout|getaddrinfo|tenant or user not found/i.test(String(e && e.message)) ?
          "Não foi possível conectar ao banco de dados. Confira a DATABASE_URL." : "Erro interno no servidor.";
      send(res, status, { error: msg });
    }
  };
}

/* ---------- Validações ---------- */
export function str(v, max) { return String(v == null ? "" : v).trim().slice(0, max || 500); }
export function slugify(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/^marmoraria\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
}
export function validSlug(s) { return /^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/.test(s) && ["api", "painel", "m", "assets", "admin"].indexOf(s) < 0; }
export function cleanColor(c, fb) { return /^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c).toLowerCase() : fb; }
export function cleanTema(t) {
  t = t || {};
  return {
    cor: cleanColor(t.cor, "#8a1c1c"),
    escura: cleanColor(t.escura, "#151313"),
    fundoLogo: t.fundoLogo === "escuro" ? "escuro" : "claro",
    fonte: t.fonte === "classica" ? "classica" : "moderna"
  };
}
export function cleanLogo(l) {
  if (l == null || l === "") return null;
  const s = String(l);
  if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s)) throw new HttpError(400, "Logo inválido. Use PNG, JPG, WEBP ou SVG.");
  if (s.length > 1500000) throw new HttpError(400, "O logo é grande demais. Use uma imagem menor.");
  return s;
}
const EMPRESA_KEYS = ["nome", "cnpj", "whatsapp", "instagram", "email", "endereco", "cidade"];
export function cleanEmpresa(e) {
  const out = {}; e = e || {};
  EMPRESA_KEYS.forEach((k) => { out[k] = str(e[k], 200); });
  return out;
}
