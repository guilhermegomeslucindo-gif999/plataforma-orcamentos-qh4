-- Plataforma QH4 · Geradores de orçamento
-- O sistema cria tudo sozinho no primeiro acesso. Este arquivo é só referência.

create schema if not exists plataforma;

create table if not exists plataforma.tenants (
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

create table if not exists plataforma.quotes (
  id text primary key,
  tenant_id text not null references plataforma.tenants(id) on delete cascade,
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
create index if not exists quotes_tenant_numero_idx on plataforma.quotes (tenant_id, numero desc);
