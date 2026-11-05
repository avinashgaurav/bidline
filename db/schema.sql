-- Bidline schema. Idempotent: `npm run db:migrate` can run any number of times.
--
-- Two rules the whole schema follows:
--   1. What a supplier wrote is stored raw and never overwritten. A buyer's
--      correction is a separate layer on top (cell_overrides), so the original
--      reading can always be shown next to the correction.
--   2. Every cell must say where it came from. quote_cells.provenance is NOT NULL.

create table if not exists users (
  id            text primary key,
  email         text not null unique,
  name          text not null,
  password_hash text not null,
  mcp_token     text not null unique,
  last_mcp_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists rfx (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  code        text not null,
  title       text not null,
  -- draft | issued | evaluating | awarded | closed
  status      text not null default 'draft',
  buyer       jsonb not null default '{}'::jsonb,
  approver    jsonb not null default '{}'::jsonb,
  terms_asked jsonb not null default '{}'::jsonb,
  notes       text,
  gate        jsonb,
  issued_at   timestamptz,
  due_at      timestamptz,
  created_via text not null default 'app',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists rfx_user_idx on rfx(user_id);

create table if not exists rfx_lines (
  id           text primary key,
  rfx_id       text not null references rfx(id) on delete cascade,
  no           integer not null,
  sku          text not null,
  group_name   text not null default '',
  description  text not null,
  spec         jsonb not null default '{}'::jsonb,
  uom          text not null,
  pack_size    integer not null default 1,
  qty          integer not null,
  hsn          text,
  baseline_inr numeric,
  unique (rfx_id, no)
);

create table if not exists rfx_questions (
  id           text primary key,
  rfx_id       text not null references rfx(id) on delete cascade,
  no           text not null,
  -- M = mandatory (a failure disqualifies at any price), D = desirable
  kind         text not null default 'M',
  q            text not null,
  doc_required boolean not null default false,
  ord          integer not null default 0,
  unique (rfx_id, no)
);

create table if not exists suppliers (
  id         text primary key,
  rfx_id     text not null references rfx(id) on delete cascade,
  code       text not null,
  name       text not null,
  city       text,
  gstin      text,
  contact    jsonb not null default '{}'::jsonb,
  channel    text not null default 'email',
  -- invited | responded | declined | removed
  status     text not null default 'invited',
  invited_at timestamptz,
  notes      text,
  created_at timestamptz not null default now(),
  unique (rfx_id, code)
);

create table if not exists documents (
  id            text primary key,
  rfx_id        text not null references rfx(id) on delete cascade,
  supplier_id   text references suppliers(id) on delete set null,
  -- quotation | questionnaire | certificate | rfx_pack | other
  kind          text not null default 'quotation',
  filename      text not null,
  mime_type     text not null,
  byte_size     integer not null,
  sha256        text not null,
  blob_url      text,
  blob_pathname text,
  -- the text body, for documents Claude saved from the chat (an email pasted in)
  text_body     text,
  -- upload | claude | seed
  source        text not null default 'upload',
  -- unread | read | failed
  status        text not null default 'unread',
  read_at       timestamptz,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists documents_rfx_idx on documents(rfx_id);

-- One row per reading of one supplier document (a "response").
create table if not exists submissions (
  id                    text primary key,
  rfx_id                text not null references rfx(id) on delete cascade,
  supplier_id           text not null references suppliers(id) on delete cascade,
  document_id           text references documents(id) on delete set null,
  -- claude | fixture
  source                text not null default 'claude',
  vendor_ref            text,
  supersedes_ref        text,
  supersedes_id         text,
  revision              integer not null default 1,
  revision_note         text,
  terms                 jsonb not null default '{}'::jsonb,
  conditional_discounts jsonb not null default '[]'::jsonb,
  stated_total          jsonb not null default '{}'::jsonb,
  unreadable_regions    jsonb not null default '[]'::jsonb,
  blanket_fallback      jsonb,
  issues                jsonb not null default '[]'::jsonb,
  superseded            boolean not null default false,
  created_at            timestamptz not null default now()
);
create index if not exists submissions_supplier_idx on submissions(supplier_id);

create table if not exists quote_cells (
  id            text primary key,
  submission_id text not null references submissions(id) on delete cascade,
  rfx_id        text not null references rfx(id) on delete cascade,
  supplier_id   text not null references suppliers(id) on delete cascade,
  line_no       integer not null,
  vendor_desc   text,
  raw_status    text not null,
  raw_price     numeric,
  raw_uom       text,
  raw_currency  text,
  raw_qty       integer,
  printed_price numeric,
  handwritten   boolean not null default false,
  offered       text,
  note          text,
  reference     jsonb,
  confidence    numeric,
  provenance    jsonb not null,
  -- a second read of the same printed number: { second, by, at }
  verification  jsonb,
  created_at    timestamptz not null default now(),
  unique (submission_id, line_no)
);
create index if not exists quote_cells_supplier_idx on quote_cells(supplier_id);

create table if not exists unmapped_items (
  id            text primary key,
  rfx_id        text not null references rfx(id) on delete cascade,
  submission_id text not null references submissions(id) on delete cascade,
  supplier_id   text not null references suppliers(id) on delete cascade,
  vendor_ref    text,
  description   text not null,
  price         numeric,
  uom           text,
  currency      text,
  qty           integer,
  note          text,
  provenance    jsonb not null,
  -- set once a person decides where, if anywhere, it belongs
  resolution    text,
  resolved_to_line_no integer,
  created_at    timestamptz not null default now()
);

-- A person's correction of one cell. Sits on top of the reading; never replaces it.
create table if not exists cell_overrides (
  id          text primary key,
  rfx_id      text not null references rfx(id) on delete cascade,
  supplier_id text not null references suppliers(id) on delete cascade,
  line_no     integer not null,
  raw         jsonb not null,
  reason      text not null,
  -- user | claude
  actor       text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists overrides_cell_idx on cell_overrides(supplier_id, line_no) where active;

create table if not exists questionnaire_reads (
  id          text primary key,
  rfx_id      text not null references rfx(id) on delete cascade,
  supplier_id text not null references suppliers(id) on delete cascade,
  document_id text references documents(id) on delete set null,
  answers     jsonb not null,
  source      text not null default 'claude',
  created_at  timestamptz not null default now()
);

create table if not exists assumptions (
  id          text primary key,
  rfx_id      text not null references rfx(id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  source      text not null,
  alternative text,
  note        text,
  confidence  text,
  set_by      text not null default 'system',
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  unique (rfx_id, key)
);

create table if not exists chases (
  id            text primary key,
  rfx_id        text not null references rfx(id) on delete cascade,
  supplier_id   text not null references suppliers(id) on delete cascade,
  items         jsonb not null,
  message       text not null,
  channel       text not null default 'email',
  due_at        timestamptz,
  sent_at       timestamptz not null default now(),
  answered_at   timestamptz,
  closed_reason text,
  created_by    text not null default 'user',
  created_at    timestamptz not null default now()
);

create table if not exists awards (
  id            text primary key,
  rfx_id        text not null references rfx(id) on delete cascade,
  scenario_key  text not null,
  snapshot      jsonb not null,
  note_md       text not null,
  commentary    text,
  share_token   text not null unique,
  -- draft | sent | approved | rejected | changes_requested | withdrawn
  status        text not null default 'sent',
  decided_by    text,
  decided_at    timestamptz,
  decision_note text,
  created_by    text not null default 'user',
  created_at    timestamptz not null default now()
);

-- The transcript. Every tool call from Claude, every edit and upload in the app,
-- every approval. Also the version counter the screens poll.
create table if not exists events (
  id           bigserial primary key,
  user_id      text references users(id) on delete cascade,
  rfx_id       text references rfx(id) on delete cascade,
  -- claude | user | approver | system
  actor        text not null,
  kind         text not null,
  tool         text,
  user_request text,
  summary      text not null,
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists events_rfx_idx on events(rfx_id, id);
create index if not exists events_user_idx on events(user_id, id);

-- Each sourcing event has a type shown beside its name: RFQ, RFP, RFI or tender.
alter table rfx add column if not exists event_type text not null default 'RFQ';

-- Buyer profile and defaults (Settings).
alter table users add column if not exists company text;
alter table users add column if not exists job_title text;
alter table users add column if not exists followup_days integer not null default 3;
alter table users add column if not exists default_approver_name text;
alter table users add column if not exists default_approver_email text;

-- The buyer's own mailbox for supplier follow-ups (Settings > Email). The
-- password is an app password, stored encrypted with a key derived from
-- AUTH_SECRET; it is never shown again after saving.
create table if not exists email_accounts (
  user_id       text primary key references users(id) on delete cascade,
  provider      text not null default 'custom',
  from_name     text not null,
  from_email    text not null,
  reply_to      text,
  smtp_host     text not null,
  smtp_port     integer not null,
  smtp_secure   boolean not null default true,
  smtp_user     text not null,
  smtp_pass_enc text not null,
  signature     text,
  bcc_self      boolean not null default true,
  verified_at   timestamptz,
  last_error    text,
  updated_at    timestamptz not null default now()
);

-- How a follow-up went out.
alter table chases add column if not exists subject text;
alter table chases add column if not exists to_email text;
alter table chases add column if not exists sent_via text not null default 'recorded';
alter table chases add column if not exists message_id text;
alter table chases add column if not exists send_error text;

-- Failed sign-ins, for throttling password guessing. Rows older than a day are
-- pruned on the next failure.
create table if not exists login_failures (
  email text not null,
  ip    text not null,
  at    timestamptz not null default now()
);
create index if not exists login_failures_email_idx on login_failures(email, at);
create index if not exists login_failures_ip_idx on login_failures(ip, at);

-- Notes on a line item ("confirm warranty with Vector"), from the app or Claude.
-- Append-only, like the audit trail.
create table if not exists line_notes (
  id         text primary key,
  rfx_id     text not null references rfx(id) on delete cascade,
  line_no    integer not null,
  text       text not null,
  actor      text not null,
  created_at timestamptz not null default now()
);
create index if not exists line_notes_rfx_idx on line_notes(rfx_id, line_no);

-- ---------------------------------------------------------------------------
-- Workspaces and roles. A workspace is one organisation; its people each have
-- one role. Sourcing events belong to the workspace, not to the person who
-- created them (rfx.user_id stays as "created by").
--   admin    everything, including the team, Claude tools and restricted events
--   buyer    create and run sourcing events
--   approver sees everything, decides awards, adds notes
--   viewer   read-only
-- ---------------------------------------------------------------------------
create table if not exists workspaces (
  id             text primary key,
  name           text not null,
  -- Claude tools an admin has switched off for everyone in the workspace
  disabled_tools text[] not null default '{}',
  created_at     timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id      text not null references users(id) on delete cascade,
  role         text not null default 'buyer',
  added_by     text references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on workspace_members(user_id);

-- An invite for someone without an account yet. Signing up with that email
-- joins the workspace with the invited role.
create table if not exists workspace_invites (
  id           text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  email        text not null,
  role         text not null,
  invited_by   text references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (workspace_id, email)
);

alter table users add column if not exists workspace_id text references workspaces(id) on delete set null;
alter table rfx add column if not exists workspace_id text references workspaces(id) on delete cascade;
create index if not exists rfx_workspace_idx on rfx(workspace_id);
-- A restricted event is visible only to admins, its creator and the people listed in rfx_access.
alter table rfx add column if not exists restricted boolean not null default false;
create table if not exists rfx_access (
  rfx_id     text not null references rfx(id) on delete cascade,
  user_id    text not null references users(id) on delete cascade,
  added_by   text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (rfx_id, user_id)
);
alter table events add column if not exists workspace_id text references workspaces(id) on delete cascade;
create index if not exists events_workspace_idx on events(workspace_id, id);

-- Backfill, safe to re-run: every person without a workspace gets their own, as admin;
-- events and audit entries follow their owner's workspace.
insert into workspaces (id, name)
  select 'ws_' || u.id, coalesce(nullif(trim(u.company), ''), split_part(u.name, ' ', 1) || '''s workspace')
  from users u
  where u.workspace_id is null and not exists (select 1 from workspace_members m where m.user_id = u.id)
  on conflict (id) do nothing;
insert into workspace_members (workspace_id, user_id, role)
  select 'ws_' || u.id, u.id, 'admin' from users u
  where u.workspace_id is null and exists (select 1 from workspaces w where w.id = 'ws_' || u.id)
  on conflict do nothing;
update users u set workspace_id = (select m.workspace_id from workspace_members m where m.user_id = u.id order by m.created_at limit 1)
  where u.workspace_id is null;
update rfx r set workspace_id = u.workspace_id from users u where r.user_id = u.id and r.workspace_id is null;
-- (Audit entries are not backfilled here: the insert trigger below fills their workspace,
-- and changing a sealed entry would break its seal.)

-- Workspace settings an admin controls: automatic reminders, approval steps by value.
--   { "reminders": { "enabled": bool, "everyDays": int },
--     "approvalSteps": [ { "aboveInr": number, "name": text, "email": text } ] }
alter table workspaces add column if not exists settings jsonb not null default '{}'::jsonb;

-- Archive instead of delete: an archived event drops out of lists but keeps its record.
alter table rfx add column if not exists archived_at timestamptz;

-- An event created without a workspace (by an older build of the app) takes its creator's.
create or replace function rfx_workspace() returns trigger language plpgsql as $fn$
begin
  if new.workspace_id is null then new.workspace_id := (select workspace_id from users where id = new.user_id); end if;
  return new;
end $fn$;
drop trigger if exists rfx_workspace_trg on rfx;
create trigger rfx_workspace_trg before insert on rfx for each row execute function rfx_workspace();
alter table rfx add column if not exists archived_by text references users(id) on delete set null;

-- Notifications are read from the audit trail; this marks how far a person has read.
alter table users add column if not exists notifications_seen_at timestamptz;

-- A conversation on one price: "Vector confirmed this on the phone".
create table if not exists cell_comments (
  id          text primary key,
  rfx_id      text not null references rfx(id) on delete cascade,
  supplier_id text not null references suppliers(id) on delete cascade,
  line_no     integer not null,
  text        text not null,
  user_id     text references users(id) on delete set null,
  actor       text not null default 'user',
  created_at  timestamptz not null default now()
);
create index if not exists cell_comments_idx on cell_comments(rfx_id, supplier_id, line_no);

-- Extra approval steps when an award is over a value threshold. Step 0 is the
-- event's own approver on awards.share_token; these follow it in order.
create table if not exists award_steps (
  id          text primary key,
  award_id    text not null references awards(id) on delete cascade,
  step        integer not null,
  name        text not null,
  email       text,
  above_inr   numeric,
  token       text not null unique,
  -- waiting | sent | approved | rejected | changes_requested
  status      text not null default 'waiting',
  decided_by  text,
  decided_at  timestamptz,
  note        text,
  unique (award_id, step)
);

-- Automatic follow-up reminders already sent, so none is sent twice.
alter table chases add column if not exists reminders_sent integer not null default 0;
alter table chases add column if not exists last_reminded_at timestamptz;

-- Tamper evidence for the audit trail. Each entry stores the hash of the
-- entry before it in its workspace and a hash over its own content, so a
-- changed or deleted entry breaks the chain (see lib/audit-chain.ts).
alter table events add column if not exists prev_hash text;
alter table events add column if not exists hash text;

alter table events add column if not exists seq bigint;
create unique index if not exists events_workspace_seq_idx on events(workspace_id, seq);

create or replace function events_hash(prev text, e events) returns text language sql immutable as $fn$
  select encode(sha256(convert_to(
    coalesce(prev, '') || '|' || coalesce(e.seq::text, '') || '|' || e.id::text || '|' || coalesce(e.workspace_id, '') || '|' || coalesce(e.rfx_id, '') || '|' ||
    coalesce(e.user_id, '') || '|' || e.actor || '|' || e.kind || '|' || coalesce(e.tool, '') || '|' ||
    coalesce(e.user_request, '') || '|' || e.summary || '|' || e.detail::text || '|' ||
    to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'UTF8')), 'hex')
$fn$;

create or replace function events_chain() returns trigger language plpgsql as $fn$
declare last record;
begin
  if new.workspace_id is null then
    new.workspace_id := coalesce((select workspace_id from rfx where id = new.rfx_id), (select workspace_id from users where id = new.user_id));
  end if;
  perform pg_advisory_xact_lock(hashtext('events:' || coalesce(new.workspace_id, '')));
  select seq, hash into last from events where workspace_id is not distinct from new.workspace_id and seq is not null order by seq desc limit 1;
  new.seq := coalesce(last.seq, 0) + 1;
  new.prev_hash := last.hash;
  new.hash := events_hash(last.hash, new);
  return new;
end $fn$;
drop trigger if exists events_chain_trg on events;
create trigger events_chain_trg before insert on events for each row execute function events_chain();

-- Entries are never edited. Deleting is allowed only through cascades (an
-- account removed by the operator), and shows up as a break in the chain.
create or replace function events_no_update() returns trigger language plpgsql as $fn$
begin
  -- the one-off sealing of older entries, and filling in a missing workspace, are the only updates allowed
  if old.hash is null or old.workspace_id is null then return new; end if;
  raise exception 'Audit entries cannot be changed';
end $fn$;
drop trigger if exists events_no_update_trg on events;
create trigger events_no_update_trg before update on events for each row execute function events_no_update();



-- Stars: a person's favourite events, shown under Pinned in the sidebar.
create table if not exists rfx_stars (
  user_id    text not null references users(id) on delete cascade,
  rfx_id     text not null references rfx(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, rfx_id)
);

-- To-dos assigned to a teammate or snoozed until a date. A to-do is derived
-- from the event's state; this only stores what a person decided about it.
create table if not exists todo_state (
  workspace_id  text not null references workspaces(id) on delete cascade,
  todo_key      text not null,
  rfx_id        text references rfx(id) on delete cascade,
  assigned_to   text references users(id) on delete set null,
  snoozed_until timestamptz,
  updated_by    text references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, todo_key)
);

-- A second connector link per person that can only read.
alter table users add column if not exists mcp_token_ro text unique;

-- Where to post workspace events besides email: Slack, Microsoft Teams or any webhook.
create table if not exists notification_channels (
  id          text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  kind        text not null,
  name        text not null,
  url_enc     text not null,
  events      text[] not null default '{}',
  created_by  text references users(id) on delete set null,
  last_ok_at  timestamptz,
  last_error  text,
  created_at  timestamptz not null default now()
);

-- Who drafted an award, so nobody approves their own.
alter table awards add column if not exists drafted_by_user text references users(id) on delete set null;
-- Which events each person wants an email about (Settings, Notifications).
alter table users add column if not exists notify jsonb not null default '{}'::jsonb;

-- One code per event within a workspace, so "RFX-2026-1268" always means one event.
create unique index if not exists rfx_workspace_code_idx on rfx(workspace_id, lower(code));

-- The seal, version 2: each entry gets the next number in its workspace while the
-- lock is held, and points at the entry numbered one before it. A single line,
-- never a fork; a gap in the numbers or a changed entry shows in the check.





-- Re-seal once, in id order per workspace, when entries have no number yet.
do $do$
declare r events; prev text; n bigint; ws text := '__none__';
begin
  if not exists (select 1 from events where seq is null) then return; end if;
  -- Hold off new entries for the moment this takes, so numbering cannot clash.
  lock table events in exclusive mode;
  alter table events disable trigger events_no_update_trg;
  update events e set workspace_id = coalesce((select workspace_id from rfx where id = e.rfx_id), (select workspace_id from users where id = e.user_id))
    where e.workspace_id is null;
  update events set seq = null;
  for r in select * from events order by workspace_id nulls first, id loop
    if r.workspace_id is distinct from ws then
      ws := r.workspace_id; prev := null; n := 0;
    end if;
    n := n + 1;
    r.seq := n;
    update events set seq = n, prev_hash = prev, hash = events_hash(prev, r) where id = r.id;
    prev := events_hash(prev, r);
  end loop;
  alter table events enable trigger events_no_update_trg;
end $do$;
