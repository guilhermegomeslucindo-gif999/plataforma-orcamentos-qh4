// GET /api/settings  →  ajustes da marmoraria logada (+ marca)
// PUT /api/settings  { ...ajustes }  →  ajustes salvos
import { handle, send, readBody, requireTenant, db, T, HttpError, cleanEmpresa } from "../lib/db.js";

export default handle(async (req, res) => {
  const t = await requireTenant(req);
  const pool = await db();

  if (req.method === "GET") {
    const { rows } = await pool.query(`select settings from ${T.tenants} where id = $1`, [t.id]);
    return send(res, 200, rows[0].settings || {});
  }

  if (req.method === "PUT") {
    const body = readBody(req);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Ajustes inválidos.");
    body.empresa = cleanEmpresa(body.empresa);
    if (!body.empresa.nome) body.empresa.nome = t.nome;
    const { rows: m } = await pool.query(`select coalesce(max(numero), 0) as m from ${T.quotes} where tenant_id = $1`, [t.id]);
    body.proximoNumero = Math.max(parseInt(body.proximoNumero, 10) || 1, Number(m[0].m) + 1);
    const json = JSON.stringify(body);
    if (json.length > 200000) throw new HttpError(400, "Ajustes grandes demais.");
    const { rows } = await pool.query(`update ${T.tenants} set settings = $2::jsonb, updated_at = now() where id = $1 returning settings`, [t.id, json]);
    return send(res, 200, rows[0].settings);
  }

  throw new HttpError(405, "Método não permitido.");
});
