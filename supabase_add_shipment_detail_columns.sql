-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Adds columns so shipment detail data (costs, milestones, tax inputs,
-- selling price, document checklist) actually persists instead of living
-- only in React state and disappearing on navigation/refresh.

alter table shipments
  add column if not exists costs jsonb default '[]'::jsonb,
  add column if not exists milestones jsonb default '[]'::jsonb,
  add column if not exists docs jsonb default '[]'::jsonb,
  add column if not exists extra_docs jsonb default '[]'::jsonb,
  add column if not exists tax_inputs jsonb default '{}'::jsonb,
  add column if not exists selling_price text;
