// Painel QH4 — /api/admin?action=...
//   POST login            { password }
//   GET  list             → marmorarias com números
//   GET  get&id=          → uma marmoraria (com logo) para editar
//   GET  slug&slug=       → link disponível?
//   POST create           { nome, slug, empresa, logo, tema, senha, squad }
//   PUT  update&id=       { nome, slug, empresa, logo, tema, ativo, squad, senha? }
//   POST password&id=     { senha }
//   DELETE delete&id=     { confirmar: slug }
import crypto from "node:crypto";
import {
  handle, send, readBody, db, tx, T, q, str, HttpError, requireAdmin, checkAdminPassword, adminToken, slow,
  hashPassword, slugify, validSlug, cleanTema, cleanLogo, cleanEmpresa, cleanSquad
} from "../lib/db.js";

function pub(r) {
  return {
    id: r.id, slug: r.slug, nome: r.nome, ativo: r.ativo, tema: r.tema || {}, squad: r.squad || "", senha: r.senha || "",
    empresa: (r.settings && r.settings.empresa) || {}, createdAt: new Date(r.created_at).getTime(), updatedAt: new Date(r.updated_at).getTime(),
    logoUrl: r.tem_logo ? "/api/logo?slug=" + encodeURIComponent(r.slug) + "&v=" + Math.floor(new Date(r.updated_at).getTime() / 1000) : null
  };
}
function checkSenha(s) {
  s = String(s || "");
  if (s.length < 6) throw new HttpError(400, "A senha da equipe precisa ter pelo menos 6 caracteres.");
  if (s.length > 100) throw new HttpError(400, "Senha longa demais.");
  return s;
}

export default handle(async (req, res) => {
  const action = q(req, "action");

  if (action === "login") {
    if (req.method !== "POST") throw new HttpError(405, "Método não permitido.");
    if (!checkAdminPassword(readBody(req).password)) { await slow(); throw new HttpError(401, "Senha incorreta."); }
    return send(res, 200, { token: adminToken() });
  }

  requireAdmin(req);
  const pool = await db();
  const id = q(req, "id");

  if (action === "list" && req.method === "GET") {
    const { rows } = await pool.query(
      `select t.id, t.slug, t.nome, t.ativo, t.tema, t.settings, t.squad, t.senha, t.created_at, t.updated_at, (t.logo is not null) as tem_logo,
              count(o.id)::int as total,
              count(o.id) filter (where o.status = 'aberto')::int as abertos,
              count(o.id) filter (where o.status = 'fechou')::int as fechados,
              count(o.id) filter (where o.status = 'perdeu')::int as perdidos,
              coalesce(sum(o.total_a), 0)::float as valor,
              coalesce(sum(o.total_a) filter (where o.status = 'fechou'), 0)::float as valor_fechado,
              count(o.id) filter (where o.created_at > now() - interval '30 days')::int as ultimos30,
              max(o.created_at) as ultimo
         from ${T.tenants} t left join ${T.quotes} o on o.tenant_id = t.id
        group by t.id order by t.nome`);
    return send(res, 200, rows.map((r) => Object.assign(pub(r), {
      stats: { total: r.total, abertos: r.abertos, fechados: r.fechados, perdidos: r.perdidos, valor: r.valor, valorFechado: r.valor_fechado, ultimos30: r.ultimos30, ultimo: r.ultimo ? new Date(r.ultimo).getTime() : null }
    })));
  }

  if (action === "get" && req.method === "GET") {
    const { rows } = await pool.query(`select *, (logo is not null) as tem_logo from ${T.tenants} where id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, "Marmoraria não encontrada.");
    return send(res, 200, Object.assign(pub(rows[0]), { logo: rows[0].logo }));
  }

  if (action === "slug" && req.method === "GET") {
    const s = slugify(q(req, "slug"));
    if (!validSlug(s)) return send(res, 200, { slug: s, ok: false, motivo: "Link inválido." });
    const { rows } = await pool.query(`select id from ${T.tenants} where slug = $1`, [s]);
    const ok = !rows[0] || rows[0].id === q(req, "id");
    return send(res, 200, { slug: s, ok, motivo: ok ? "" : "Esse link já está em uso." });
  }

  if (action === "create" && req.method === "POST") {
    const b = readBody(req);
    const nome = str(b.nome, 120);
    if (!nome) throw new HttpError(400, "Informe o nome da marmoraria.");
    const slug = slugify(b.slug || nome);
    if (!validSlug(slug)) throw new HttpError(400, "Link inválido. Use letras, números e hífen.");
    const senha = checkSenha(b.senha);
    const empresa = cleanEmpresa(Object.assign({}, b.empresa, { nome: (b.empresa && str(b.empresa.nome, 200)) || nome }));
    const settings = { empresa, proximoNumero: 1 };
    try {
      const { rows } = await pool.query(
        `insert into ${T.tenants} (id, slug, nome, senha_hash, senha, logo, tema, settings, squad)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9) returning *, (logo is not null) as tem_logo`,
        [crypto.randomUUID(), slug, nome, hashPassword(senha), senha, cleanLogo(b.logo), JSON.stringify(cleanTema(b.tema)), JSON.stringify(settings), cleanSquad(b.squad)]);
      return send(res, 200, pub(rows[0]));
    } catch (e) {
      if (e && e.code === "23505") throw new HttpError(409, "Esse link já está em uso. Escolha outro.");
      throw e;
    }
  }

  if (action === "update" && req.method === "PUT") {
    const b = readBody(req);
    const out = await tx(async (c) => {
      const cur = await c.query(`select * from ${T.tenants} where id = $1 for update`, [id]);
      const t = cur.rows[0];
      if (!t) throw new HttpError(404, "Marmoraria não encontrada.");
      const nome = b.nome != null ? str(b.nome, 120) : t.nome;
      if (!nome) throw new HttpError(400, "Informe o nome da marmoraria.");
      const slug = b.slug != null ? slugify(b.slug) : t.slug;
      if (!validSlug(slug)) throw new HttpError(400, "Link inválido. Use letras, números e hífen.");
      const settings = Object.assign({}, t.settings || {});
      if (b.empresa) settings.empresa = cleanEmpresa(Object.assign({}, settings.empresa || {}, b.empresa));
      const logo = b.logo === undefined ? t.logo : cleanLogo(b.logo);
      const tema = b.tema ? cleanTema(b.tema) : t.tema;
      const ativo = b.ativo == null ? t.ativo : !!b.ativo;
      const squad = b.squad == null ? t.squad : cleanSquad(b.squad);
      // senha nova só quando foi alterada: troca o acesso e desconecta quem estava logado
      const novaSenha = b.senha != null && String(b.senha) !== String(t.senha || "") ? checkSenha(b.senha) : null;
      try {
        const { rows } = await c.query(
          `update ${T.tenants} set nome = $2, slug = $3, logo = $4, tema = $5::jsonb, settings = $6::jsonb, ativo = $7, squad = $8,
             senha = coalesce($9, senha), senha_hash = coalesce($10, senha_hash),
             token_version = token_version + (case when $9::text is null then 0 else 1 end), updated_at = now()
           where id = $1 returning *, (logo is not null) as tem_logo`,
          [id, nome, slug, logo, JSON.stringify(tema), JSON.stringify(settings), ativo, squad, novaSenha, novaSenha ? hashPassword(novaSenha) : null]);
        return rows[0];
      } catch (e) {
        if (e && e.code === "23505") throw new HttpError(409, "Esse link já está em uso. Escolha outro.");
        throw e;
      }
    });
    return send(res, 200, pub(out));
  }

  if (action === "password" && req.method === "POST") {
    const senha = checkSenha(readBody(req).senha);
    const { rowCount } = await pool.query(
      `update ${T.tenants} set senha_hash = $2, senha = $3, token_version = token_version + 1, updated_at = now() where id = $1`, [id, hashPassword(senha), senha]);
    if (!rowCount) throw new HttpError(404, "Marmoraria não encontrada.");
    return send(res, 200, { ok: true });
  }

  if (action === "delete" && req.method === "DELETE") {
    const b = readBody(req);
    const { rows } = await pool.query(`select slug from ${T.tenants} where id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, "Marmoraria não encontrada.");
    if (str(b.confirmar) !== rows[0].slug) throw new HttpError(400, "Confirmação incorreta.");
    await pool.query(`delete from ${T.tenants} where id = $1`, [id]);
    return send(res, 200, { ok: true });
  }

  throw new HttpError(400, "Ação inválida.");
});
