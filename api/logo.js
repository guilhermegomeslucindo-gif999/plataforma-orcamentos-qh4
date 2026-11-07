// GET /api/logo?slug=...  →  imagem do logo da marmoraria
import { handle, db, T, q, HttpError } from "../lib/db.js";

export default handle(async (req, res) => {
  if (req.method !== "GET") throw new HttpError(405, "Método não permitido.");
  const pool = await db();
  const { rows } = await pool.query(`select logo from ${T.tenants} where slug = $1`, [q(req, "slug")]);
  const logo = rows[0] && rows[0].logo;
  const m = logo && String(logo).match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) throw new HttpError(404, "Logo não encontrado.");
  const buf = Buffer.from(m[2], "base64");
  res.statusCode = 200;
  res.setHeader("Content-Type", m[1]);
  res.setHeader("Content-Length", buf.length);
  res.setHeader("Cache-Control", q(req, "v") ? "public, max-age=31536000, immutable" : "public, max-age=300");
  if (m[1] === "image/svg+xml") res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(buf);
});
