-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- Adds a place to store a verification file (photo/PDF) per receipt and sale.
-- Files themselves go to the existing "documents" Storage bucket (same one
-- shipment documents already use); this column just stores the path.

alter table receipts add column if not exists attachment_path text;
alter table sales add column if not exists attachment_path text;
