-- ============================================================
-- Qualiopi Analyzer — initial schema
-- Multi-tenant strict : toute requête est filtrée par organization_id
-- via les policies RLS basées sur l'appartenance de l'utilisateur.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- organizations
-- ------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- ------------------------------------------------------------
-- organization_members  (lien user <-> org)
-- ------------------------------------------------------------
create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table public.organization_members enable row level security;

-- helper : organisations auxquelles appartient l'utilisateur courant
create or replace function public.current_user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.organization_members
  where user_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- analysis_settings
-- ------------------------------------------------------------
create table if not exists public.analysis_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  value text not null,
  is_default boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index if not exists analysis_settings_org_key_idx
  on public.analysis_settings(organization_id, key, updated_at desc);

alter table public.analysis_settings enable row level security;

-- ------------------------------------------------------------
-- analysis_history
-- ------------------------------------------------------------
create table if not exists public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  doc_type text not null,
  file_name text not null,
  result_text text,
  conformity_score int check (conformity_score between 0 and 100),
  admin_comment text default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists analysis_history_org_created_idx
  on public.analysis_history(organization_id, created_at desc);

alter table public.analysis_history enable row level security;

-- ============================================================
-- POLICIES
-- ============================================================

-- organizations : un utilisateur voit uniquement les orgs dont il est membre
drop policy if exists "orgs_select_member" on public.organizations;
create policy "orgs_select_member" on public.organizations
  for select using (id in (select public.current_user_org_ids()));

-- organization_members : voir / gérer ses propres lignes
drop policy if exists "org_members_select_self" on public.organization_members;
create policy "org_members_select_self" on public.organization_members
  for select using (user_id = auth.uid());

-- analysis_settings — filtrées strictement par organization_id du membre
drop policy if exists "analysis_settings_select" on public.analysis_settings;
create policy "analysis_settings_select" on public.analysis_settings
  for select using (organization_id in (select public.current_user_org_ids()));

drop policy if exists "analysis_settings_insert" on public.analysis_settings;
create policy "analysis_settings_insert" on public.analysis_settings
  for insert with check (organization_id in (select public.current_user_org_ids()));

-- pas d'UPDATE sur analysis_settings (versioning par INSERT)
drop policy if exists "analysis_settings_update_blocked" on public.analysis_settings;
create policy "analysis_settings_update_blocked" on public.analysis_settings
  for update using (false);

-- DELETE autorisé uniquement sur les lignes non par défaut (reset des prompts)
drop policy if exists "analysis_settings_delete_non_default" on public.analysis_settings;
create policy "analysis_settings_delete_non_default" on public.analysis_settings
  for delete using (
    organization_id in (select public.current_user_org_ids())
    and is_default = false
  );

-- analysis_history — filtrées strictement par organization_id du membre
drop policy if exists "analysis_history_select" on public.analysis_history;
create policy "analysis_history_select" on public.analysis_history
  for select using (
    organization_id in (select public.current_user_org_ids())
    and deleted_at is null
  );

drop policy if exists "analysis_history_insert" on public.analysis_history;
create policy "analysis_history_insert" on public.analysis_history
  for insert with check (
    organization_id in (select public.current_user_org_ids())
    and user_id = auth.uid()
  );

drop policy if exists "analysis_history_update" on public.analysis_history;
create policy "analysis_history_update" on public.analysis_history
  for update using (organization_id in (select public.current_user_org_ids()))
  with check (organization_id in (select public.current_user_org_ids()));

-- DELETE en dur interdit : on utilise deleted_at (soft delete)
drop policy if exists "analysis_history_delete_blocked" on public.analysis_history;
create policy "analysis_history_delete_blocked" on public.analysis_history
  for delete using (false);
