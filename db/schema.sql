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
