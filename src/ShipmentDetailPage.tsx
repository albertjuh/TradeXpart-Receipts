import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, ArrowRight, Loader2, Check,
  ChevronDown, FileText, Link, X, Pencil,
} from 'lucide-react';
import { supabase } from './supabase';
import type { Shipment } from './ShipmentsPage';

type Props = {
  shipmentId: string;
  onBack: () => void;
};

type ShipmentStatus = Shipment['status'];

const STATUS_ORDER: ShipmentStatus[] = [
  'draft', 'in_transit', 'at_customs', 'cleared', 'delivered',
];

const ALL_STATUSES: ShipmentStatus[] = [
  'draft', 'in_transit', 'at_customs', 'cleared', 'delivered', 'cancelled',
];

const STATUS_LABELS: Record<string, string> = {
  draft:      'Draft',
  in_transit: 'In Transit',
  at_customs: 'At Customs',
  cleared:    'Cleared',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

const STATUS_BADGE: Record<string, string> = {
  draft:      'bg-neutral-800/60 text-neutral-400 border-neutral-700',
  in_transit: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  at_customs: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  cleared:    'bg-purple-500/10 text-purple-400 border-purple-500/30',
  delivered:  'bg-brand-accent/10 text-brand-accent border-brand-accent/30',
  cancelled:  'bg-red-500/10 text-red-400 border-red-500/30',
};

export default function ShipmentDetailPage({ shipmentId, onBack }: Props) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .eq('id', shipmentId)
        .single();
      if (!error && data) setShipment(data as Shipment);
      setLoading(false);
    };
    fetch();
  }, [shipmentId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStatusDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleStatusChange = async (newStatus: ShipmentStatus) => {
    if (!shipment) return;
    setStatusDropdown(false);
    setUpdatingStatus(true);
    const { error } = await supabase
      .from('shipments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', shipmentId);
    if (!error) {
      setShipment(prev => prev ? { ...prev, status: newStatus } : prev);
      showToast('Status updated');
    } else {
      showToast('Failed to update status');
    }
    setUpdatingStatus(false);
  };

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 text-brand-accent animate-spin" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="w-full max-w-4xl mx-auto px-6 pt-10 pb-28 md:pb-10 overflow-x-hidden box-border">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-brand-text-muted hover:text-brand-accent transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Shipments
        </button>
        <p className="text-brand-text-muted font-mono text-sm">Shipment not found.</p>
      </div>
    );
  }

  const statusIndex = STATUS_ORDER.indexOf(shipment.status);
  const party = shipment.type === 'import' ? shipment.supplier : shipment.buyer;
  const partyLabel = shipment.type === 'import' ? 'SUPPLIER' : 'BUYER';

  const details: { label: string; value: string | null | number }[] = [
    { label: 'B/L Number',      value: shipment.bl_number },
    { label: 'Container #',     value: shipment.container_number },
    { label: 'Container Type',  value: shipment.container_type },
    { label: 'HS Code',         value: shipment.hs_code },
    { label: 'Product Type',    value: shipment.product_type },
    { label: 'Year',            value: shipment.year },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto px-6 pt-10 pb-28 md:pb-10 overflow-x-hidden box-border space-y-5">

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-brand-text-muted hover:text-brand-accent transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Shipments
      </button>

      {/* ── Section 1: Header card ─────────────────────────────── */}
      <div className="glass rounded-2xl p-6 md:p-8 relative overflow-hidden">
        {/* accent top line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent/40 to-transparent" />

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className={`px-3 py-1 rounded-lg text-[9px] font-mono font-bold uppercase border ${
            shipment.type === 'import'
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
              : 'bg-brand-accent/10 text-brand-accent border-brand-accent/30'
          }`}>
            {shipment.type}
          </span>
          <span className={`px-3 py-1 rounded-lg text-[9px] font-mono font-bold uppercase border ${STATUS_BADGE[shipment.status] ?? STATUS_BADGE.draft}`}>
            {STATUS_LABELS[shipment.status] ?? shipment.status}
          </span>
        </div>

        {/* Commodity title */}
        <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-tighter leading-none mb-6">
          {shipment.commodity ?? 'Unknown Commodity'}
        </h1>

        {/* Route + party */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm text-brand-text-muted">
          <div className="flex items-center gap-2">
            <span>{shipment.origin_country ?? '?'}</span>
            <ArrowRight className="w-4 h-4 text-brand-accent flex-shrink-0" />
            <span>{shipment.destination_country ?? '?'}</span>
          </div>
          {party && (
            <div className="flex items-center gap-2">
              <span className="text-[8px] uppercase tracking-widest text-brand-border">{partyLabel}</span>
              <span className="text-white">{party}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Details grid ────────────────────────────── */}
      <div className="glass rounded-2xl p-6">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-4">
          Shipment Details
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {details.map(({ label, value }) => (
            <div
              key={label}
              className="bg-black/25 rounded-xl px-4 py-3 border border-brand-border/40"
            >
              <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1">{label}</p>
              <p className="text-sm font-mono text-white">{value != null ? String(value) : '—'}</p>
            </div>
          ))}
        </div>

        {shipment.notes && (
          <div className="mt-3 bg-black/25 rounded-xl px-4 py-3 border border-brand-border/40">
            <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1">Notes</p>
            <p className="text-sm font-mono text-brand-text-muted leading-relaxed">{shipment.notes}</p>
          </div>
        )}
      </div>

      {/* ── Section 3: Status Timeline ─────────────────────────── */}
      <div className="glass rounded-2xl p-6">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-6">
          Status Timeline
        </p>

        {shipment.status === 'cancelled' ? (
          <div className="flex items-center gap-3 text-red-400 font-mono text-[11px] uppercase tracking-widest">
            <div className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <X className="w-4 h-4" />
            </div>
            Shipment cancelled
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            {STATUS_ORDER.map((step, i) => {
              const isDone    = statusIndex > i;
              const isCurrent = statusIndex === i;
              const isLast    = i === STATUS_ORDER.length - 1;

              return (
                <div key={step} className="flex items-start gap-4">
                  {/* dot + connector column */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                      isDone
                        ? 'bg-brand-accent/20 border-brand-accent'
                        : isCurrent
                          ? 'bg-brand-accent border-brand-accent shadow-[0_0_12px_rgba(0,255,102,0.4)]'
                          : 'bg-transparent border-brand-border'
                    }`}>
                      {isDone ? (
                        <Check className="w-3.5 h-3.5 text-brand-accent" />
                      ) : isCurrent ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-black" />
                      ) : null}
                    </div>
                    {!isLast && (
                      <div className={`w-px flex-1 min-h-[28px] mt-1 mb-1 ${
                        isDone ? 'bg-brand-accent/40' : 'bg-brand-border'
                      }`} />
                    )}
                  </div>

                  {/* label */}
                  <div className={`pt-1.5 pb-6 last:pb-0 text-[11px] font-mono uppercase tracking-widest ${
                    isDone    ? 'text-brand-accent/70' :
                    isCurrent ? 'text-brand-accent font-bold' :
                                'text-brand-text-muted/40'
                  }`}>
                    {STATUS_LABELS[step]}
                    {isCurrent && (
                      <span className="ml-2 text-[8px] bg-brand-accent/10 text-brand-accent border border-brand-accent/20 px-2 py-0.5 rounded-full">
                        CURRENT
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 4: Quick Actions ───────────────────────────── */}
      <div className="glass rounded-2xl p-4 flex flex-wrap gap-3 items-center">

        {/* Edit Status */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setStatusDropdown(v => !v)}
            disabled={updatingStatus}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-accent/30 bg-brand-accent/5 text-brand-accent text-[10px] font-mono uppercase tracking-widest hover:bg-brand-accent/10 transition-all disabled:opacity-40"
          >
            {updatingStatus
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Pencil className="w-3.5 h-3.5" />
            }
            Edit Status
            <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${statusDropdown ? 'rotate-180' : ''}`} />
          </button>

          {statusDropdown && (
            <div className="absolute left-0 top-full mt-2 z-30 w-44 bg-[#141414] border border-brand-border rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
              {ALL_STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`w-full text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest transition-colors hover:bg-brand-border/40 flex items-center justify-between ${
                    shipment.status === s ? 'text-brand-accent' : 'text-brand-text-muted'
                  }`}
                >
                  {STATUS_LABELS[s]}
                  {shipment.status === s && <Check className="w-3 h-3" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => showToast('Document upload coming soon')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-border text-brand-text-muted text-[10px] font-mono uppercase tracking-widest hover:border-brand-text-muted hover:text-white transition-all"
        >
          <FileText className="w-3.5 h-3.5" />
          Add Document
        </button>

        <button
          onClick={() => showToast('Receipt linking coming soon')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-border text-brand-text-muted text-[10px] font-mono uppercase tracking-widest hover:border-brand-text-muted hover:text-white transition-all"
        >
          <Link className="w-3.5 h-3.5" />
          Link Receipt
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-brand-card border border-brand-border text-[10px] font-mono uppercase tracking-widest text-brand-accent shadow-2xl whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
