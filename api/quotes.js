// Orçamentos da marmoraria logada
// GET    /api/quotes             → lista (sem as imagens)
// GET    /api/quotes?full=1      → lista completa (para exportar)
// GET    /api/quotes?id=ID       → um orçamento completo
// POST   /api/quotes  {orçamento} → cria ou atualiza (gera o número na primeira vez)
// PATCH  /api/quotes?id=ID {titulo?, status?, motivo?}
// DELETE /api/quotes?id=ID
import { handle, send, readBody, requireTenant, db, tx, T, q as qs, str, HttpError } from "../lib/db.js";

const STATUS = ["aberto", "fechou", "perdeu"];
const COLS = "id, numero, titulo, status, motivo, created_at, updated_at";

function toQuote(row) {
  const q = Object.assign({}, row.data || {});
  q.id = row.id; q.numero = row.numero; q.titulo = row.titulo; q.status = row.status; q.motivo = row.motivo;
  q.createdAt = new Date(row.created_at).getTime(); q.updatedAt = new Date(row.updated_at).getTime();
  if (row.n_imgs != null) q.nImagens = Number(row.n_imgs);
  return q;
}
function money(v) { const n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }

export default handle(async (req, res) => {
  const t = await requireTenant(req);
  const pool = await db();
  const id = qs(req, "id");

  if (req.method === "GET") {
    if (id) {
      const { rows } = await pool.query(`select ${COLS}, data from ${T.quotes} where id = $1 and tenant_id = $2`, [id, t.id]);
      if (!rows[0]) throw new HttpError(404, "Orçamento não encontrado.");
      return send(res, 200, toQuote(rows[0]));
    }
    const full = qs(req, "full") === "1";
    const { rows } = await pool.query(
      `select ${COLS}, ${full ? "data" : "data - 'imagens' as data"},
              jsonb_array_length(coalesce(data->'imagens', '[]'::jsonb)) as n_imgs
         from ${T.quotes} where tenant_id = $1 order by numero desc nulls last, created_at desc limit 3000`, [t.id]);
    return send(res, 200, rows.map(toQuote));
  }

  if (req.method === "POST") {
    const q = readBody(req);
    if (!q || typeof q !== "object" || !/^[A-Za-z0-9_-]{4,64}$/.test(String(q.id || ""))) throw new HttpError(400, "Orçamento inválido.");
    if (!q.cliente || !str(q.cliente.nome)) throw new HttpError(400, "Preencha o nome do cliente.");
    const saved = await tx(async (c) => {
      const ex = await c.query(`select tenant_id, numero, status, motivo from ${T.quotes} where id = $1 for update`, [q.id]);
      if (ex.rows[0] && ex.rows[0].tenant_id !== t.id) throw new HttpError(409, "Identificador já usado. Gere o orçamento de novo.");
      let numero = ex.rows[0] ? ex.rows[0].numero : null;
      if (numero == null) {
        const s = await c.query(`select settings from ${T.tenants} where id = $1 for update`, [t.id]);
        const m = await c.query(`select coalesce(max(numero), 0) as m from ${T.quotes} where tenant_id = $1`, [t.id]);
        numero = Math.max(parseInt((s.rows[0].settings || {}).proximoNumero, 10) || 1, Number(m.rows[0].m) + 1);
        await c.query(`update ${T.tenants} set settings = jsonb_set(settings, '{proximoNumero}', to_jsonb($2::int), true) where id = $1`, [t.id, numero + 1]);
      }
      const status = ex.rows[0] ? ex.rows[0].status : "aberto";
      const motivo = ex.rows[0] ? ex.rows[0].motivo : "";
      const data = Object.assign({}, q);
      ["id", "numero", "status", "motivo", "createdAt", "updatedAt", "nImagens"].forEach((k) => delete data[k]);
      const { rows } = await c.query(
        `insert into ${T.quotes} (id, tenant_id, numero, titulo, cliente, vendedor, status, motivo, total_a, total_b, data)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
         on conflict (id) do update set
           titulo = excluded.titulo, cliente = excluded.cliente, vendedor = excluded.vendedor,
           total_a = excluded.total_a, total_b = excluded.total_b, data = excluded.data, updated_at = now()
         returning ${COLS}, data`,
        [q.id, t.id, numero, str(q.titulo, 160), str(q.cliente.nome, 160), str(q.vendedor && q.vendedor.nome, 120), status, motivo,
          money(q.totalA), q.comparar ? money(q.totalB) : null, JSON.stringify(data)]);
      return rows[0];
    });
    return send(res, 200, toQuote(saved));
  }

  if (req.method === "PATCH") {
    if (!id) throw new HttpError(400, "Informe o orçamento.");
    const b = readBody(req);
    const sets = [], vals = [id, t.id];
    if (b.titulo != null) { vals.push(str(b.titulo, 160)); sets.push("titulo = $" + vals.length); }
    if (b.status != null) {
      if (STATUS.indexOf(b.status) < 0) throw new HttpError(400, "Status inválido.");
      vals.push(b.status); sets.push("status = $" + vals.length);
    }
    if (b.status != null && b.status !== "perdeu") sets.push("motivo = ''");
    else if (b.motivo != null) { vals.push(str(b.motivo, 120)); sets.push("motivo = $" + vals.length); }
    if (!sets.length) throw new HttpError(400, "Nada para alterar.");
    const { rows } = await pool.query(
      `update ${T.quotes} set ${sets.join(", ")}, updated_at = now() where id = $1 and tenant_id = $2
       returning ${COLS}, data - 'imagens' as data, jsonb_array_length(coalesce(data->'imagens', '[]'::jsonb)) as n_imgs`, vals);
    if (!rows[0]) throw new HttpError(404, "Orçamento não encontrado.");
    return send(res, 200, toQuote(rows[0]));
  }

  if (req.method === "DELETE") {
    if (!id) throw new HttpError(400, "Informe o orçamento.");
    const { rowCount } = await pool.query(`delete from ${T.quotes} where id = $1 and tenant_id = $2`, [id, t.id]);
    if (!rowCount) throw new HttpError(404, "Orçamento não encontrado.");
    return send(res, 200, { ok: true });
  }

  throw new HttpError(405, "Método não permitido.");
});
