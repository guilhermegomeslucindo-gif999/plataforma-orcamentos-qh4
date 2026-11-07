// POST /api/login  { slug, password }  →  { token }   (login da equipe da marmoraria)
import { handle, send, readBody, db, T, verifyPassword, tenantToken, slow, HttpError } from "../lib/db.js";

export default handle(async (req, res) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido.");
  const { slug, password } = readBody(req);
  const pool = await db();
  const { rows } = await pool.query(`select id, ativo, senha_hash, token_version from ${T.tenants} where slug = $1`, [String(slug || "")]);
  const t = rows[0];
  if (!t || !verifyPassword(password, t.senha_hash)) { await slow(); throw new HttpError(401, "Senha incorreta."); }
  if (!t.ativo) throw new HttpError(403, "Este sistema está desativado. Fale com a QH4.");
  send(res, 200, { token: tenantToken(t) });
});
