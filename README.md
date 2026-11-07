# Plataforma QH4 · Geradores de orçamento

Uma única plataforma para criar e gerenciar o gerador de orçamentos de cada marmoraria.

- **`/painel`**: painel da QH4, para os gestores. Cadastra marmorarias (dados, logo, cores e senha), acompanha os números de cada uma, troca senhas e ativa ou desativa contas.
- **`/m/nome-da-marmoraria`**: gerador de orçamentos da marmoraria, com a identidade dela, link e senha próprios. Cada marmoraria só enxerga os próprios orçamentos.

## Estrutura

```
public/          páginas (painel, gerador) e estilos
api/             funções da Vercel (painel, login, orçamentos, ajustes, marca, logo)
lib/db.js        banco de dados, senhas e sessões
schema.sql       estrutura do banco (também criada sozinha no primeiro acesso)
dev-server.mjs   servidor para testar no computador (opcional)
```

## Publicar

1. Suba esta pasta num repositório **privado** no GitHub.
2. Na Vercel: **Add New → Project**, escolha o repositório, Framework Preset **Other**.
3. Em **Environment Variables**, cadastre:

| Variável | O que é |
|---|---|
| `DATABASE_URL` | endereço do banco (Supabase) |
| `ADMIN_PASSWORD` | senha do painel da QH4 (só para os gestores) |

4. **Deploy**. Abra o link da Vercel: ele leva direto ao painel.

## Cadastrar uma marmoraria

1. Entre em `/painel` com a senha do painel.
2. Clique em **Nova marmoraria**, preencha nome, CNPJ, WhatsApp e endereço e envie o logo. As cores são sugeridas a partir do logo.
3. Defina a senha da equipe (ou clique em **Gerar senha**) e em **Criar gerador**.
4. Copie a mensagem pronta, com link e senha, e envie para o cliente.

## Ajustar os campos de uma marmoraria

No painel, abra **Editar** na marmoraria e vá até **Campos do gerador**:

- **Campos padrão:** desligue o que a marmoraria não usa (some do formulário e do PDF).
- **Campos novos:** crie campos (texto, número, valor, sim/não ou lista), escolha onde aparecem (cliente, peça ou condições), se vão no PDF e se são obrigatórios.
- **Listas de sugestões:** materiais, detalhes de acabamento, ambientes, peças, pagamentos e motivos de perda.

Salve: a equipe vê a mudança ao recarregar o gerador. Só o painel da QH4 altera essa configuração.

## Testar no computador (opcional)

```bash
cp .env.example .env    # preencha DATABASE_URL e ADMIN_PASSWORD
npm install
npm run dev             # http://localhost:3000/painel
```
