// GET /api/brand?slug=...  →  nome, cores e logo da marmoraria (público: usado na tela de entrada)
import { handle, send, db, T, q, HttpError } from "../lib/db.js";

export default handle(async (req, res) => {
  if (req.method !== "GET") throw new HttpError(405, "Método não permitido.");
  const slug = q(req, "slug");
  const pool = await db();
  const { rows } = await pool.query(
    `select slug, nome, ativo, tema, (logo is not null) as tem_logo, extract(epoch from updated_at)::bigint as v from ${T.tenants} where slug = $1`, [slug]);
  const t = rows[0];
  if (!t) throw new HttpError(404, "Marmoraria não encontrada. Confira o link.");
  send(res, 200, {
    slug: t.slug, nome: t.nome, ativo: t.ativo, tema: t.tema || {},
    logo: t.tem_logo ? "/api/logo?slug=" + encodeURIComponent(t.slug) + "&v=" + t.v : null
  });
});
