-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Creates the sales table: the authoritative revenue/transaction log,
-- separate from shipments.selling_price (which stays a per-shipment margin estimate).

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  date text not null,
  customer text,
  amount numeric not null,
  currency text not null default 'TZS',
  shipment_id uuid references shipments(id) on delete set null,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid')),
  payment_method text,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_shipment_id_idx on sales(shipment_id);
create index if not exists sales_date_idx on sales(date);

alter table sales enable row level security;

-- Same fully-open policy as receipts/shipments today (no auth exists yet to scope
-- it to). Pre-existing gap, not introduced by this feature — tighten when
-- login/roles land.
create policy "sales_all_access" on sales for all using (true) with check (true);
