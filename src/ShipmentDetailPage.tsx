import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, ArrowRight, Loader2, Check, ChevronDown,
  X, Pencil, Plus, AlertTriangle, Calculator,
  FileText, DollarSign, TrendingUp, Package, CheckSquare,
} from 'lucide-react';
import { supabase } from './supabase';
import type { Shipment } from './ShipmentsPage';

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  shipmentId: string;
  onBack: () => void;
};

type CostLine = {
  id: string;
  description: string;
  amountTZS: number;
  amountUSD: number;
  paid: boolean;
  hasReceipt: boolean;
};

type DocItem = {
  key: string;
  label: string;
  uploaded: boolean;
  uploadDate?: string;
};

type MilestoneStatus = 'pending' | 'done' | 'skipped';

type Milestone = {
  key: string;
  label: string;
  status: MilestoneStatus;
  date?: string;
  notes?: string;
};

type TaxInputs = {
  cifUSD: string;
  fobUSD: string;
  exchangeRate: string;
  dutyRate: string;
  exemption: 'none' | 'partial' | 'full';
  partialPct: string;
  quantity: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  draft:      'bg-neutral-800/60 text-neutral-400 border-neutral-700',
  in_transit: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  at_customs: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  cleared:    'bg-purple-500/10 text-purple-400 border-purple-500/30',
  delivered:  'bg-brand-accent/10 text-brand-accent border-brand-accent/30',
  cancelled:  'bg-red-500/10 text-red-400 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  draft:      'Draft',
  in_transit: 'In Transit',
  at_customs: 'At Customs',
  cleared:    'Cleared',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
};

const DEFAULT_COSTS: CostLine[] = [
  { id: 'freight',   description: 'Freight Cost',               amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'insurance', description: 'Insurance',                  amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'sgs',       description: 'SGS Inspection',             amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'printing',  description: 'Printing Costs',             amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'port',      description: 'Port Charges / Wharfage',    amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'icd',       description: 'ICD Charges',                amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'transport', description: 'Transport (ICD to Godown)',   amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'offload',   description: 'Offloading Labour',          amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'clearing',  description: 'Clearing & Forwarding Fee',  amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'agency',    description: 'Agency Fee',                 amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'demurrage', description: 'Demurrage',                  amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
];

const DEFAULT_DOCS: DocItem[] = [
  { key: 'contract',   label: 'Purchase Contract',      uploaded: false },
  { key: 'proforma',   label: 'Proforma Invoice',       uploaded: false },
  { key: 'commercial', label: 'Commercial Invoice',     uploaded: false },
  { key: 'packing',    label: 'Packing List',           uploaded: false },
  { key: 'bl',         label: 'Bill of Lading',         uploaded: false },
  { key: 'origin',     label: 'Certificate of Origin',  uploaded: false },
  { key: 'sgs',        label: 'SGS / Inspection Report',uploaded: false },
  { key: 'tra',        label: 'TRA Assessment',         uploaded: false },
  { key: 'taxpayment', label: 'Tax Payment Receipt',    uploaded: false },
  { key: 'delivery',   label: 'Delivery Order',         uploaded: false },
  { key: 'icd',        label: 'ICD Invoice',            uploaded: false },
  { key: 'wharfage',   label: 'Wharfage Receipt',       uploaded: false },
];

const DEFAULT_MILESTONES: Milestone[] = [
  { key: 'm1',  label: 'Shipment Created',         status: 'pending' },
  { key: 'm2',  label: 'Contract Signed',          status: 'pending' },
  { key: 'm3',  label: 'PI Received',              status: 'pending' },
  { key: 'm4',  label: 'Payment Made',             status: 'pending' },
  { key: 'm5',  label: 'Production Started',       status: 'pending' },
  { key: 'm6',  label: 'Vessel Departed',          status: 'pending' },
  { key: 'm7',  label: 'ETA Confirmed',            status: 'pending' },
  { key: 'm8',  label: 'Vessel Arrived',           status: 'pending' },
  { key: 'm9',  label: 'TRA Assessment Received',  status: 'pending' },
  { key: 'm10', label: 'Taxes Paid',               status: 'pending' },
  { key: 'm11', label: 'Delivery Order Released',  status: 'pending' },
  { key: 'm12', label: 'Container Exited Port',    status: 'pending' },
  { key: 'm13', label: 'Goods Received at Godown', status: 'pending' },
  { key: 'm14', label: 'Container Returned',       status: 'pending' },
  { key: 'm15', label: 'Shipment Closed',          status: 'pending' },
];

const fmt  = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Section header component ─────────────────────────────────────────────────

function SectionHeader({
  title, icon, open, onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-5 py-4 border-b border-brand-border hover:bg-white/[0.02] transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="text-brand-accent">{icon}</span>
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand-text-muted">{title}</span>
      </div>
      <ChevronDown className={`w-4 h-4 text-brand-text-muted transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ShipmentDetailPage({ shipmentId, onBack }: Props) {
  const [shipment, setShipment]   = useState<Shipment | null>(null);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState<string | null>(null);

  // Which sections are open
  const [open, setOpen] = useState<Set<string>>(new Set(['details', 'tax']));
  const toggle = (k: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // Cost tracker
  const [costs, setCosts]           = useState<CostLine[]>(DEFAULT_COSTS);
  const [newCostDesc, setNewCostDesc] = useState('');

  // Documents
  const [docs, setDocs] = useState<DocItem[]>(DEFAULT_DOCS);

  // Milestones
  const [milestones, setMilestones]         = useState<Milestone[]>(DEFAULT_MILESTONES);
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);

  // Tax calculator
  const [tax, setTax] = useState<TaxInputs>({
    cifUSD: '', fobUSD: '', exchangeRate: '', dutyRate: '',
    exemption: 'none', partialPct: '50', quantity: '',
  });

  // Profitability
  const [sellingPrice, setSellingPrice] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .eq('id', shipmentId)
        .single();
      if (!error && data) setShipment(data as Shipment);
      setLoading(false);
    };
    load();
  }, [shipmentId]);

  // ── Tax calculations ──────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const cifUSD = parseFloat(tax.cifUSD)      || 0;
    const fobUSD = parseFloat(tax.fobUSD)      || 0;
    const rate   = parseFloat(tax.exchangeRate) || 0;
    const dutyPct= parseFloat(tax.dutyRate)    || 0;
    const qty    = parseFloat(tax.quantity)    || 1;

    const cifTZS = cifUSD * rate;
    const fobTZS = fobUSD * rate;

    let importDuty = 0;
    if (tax.exemption === 'none') {
      importDuty = cifTZS * (dutyPct / 100);
    } else if (tax.exemption === 'partial') {
      const exemptFrac = (parseFloat(tax.partialPct) || 0) / 100;
      importDuty = cifTZS * (dutyPct / 100) * (1 - exemptFrac);
    }

    const rdl        = cifTZS * 0.02;
    const cpf        = fobTZS * 0.006;
    const vat        = (cifTZS + importDuty) * 0.18;
    const totalTax   = importDuty + rdl + cpf + vat;
    const totalOps   = costs.reduce((s, c) => s + c.amountTZS, 0);
    const totalLanded= cifTZS + totalTax + totalOps;
    const perUnit    = qty > 1 ? totalLanded / qty : 0;

    const sp          = parseFloat(sellingPrice) || 0;
    const grossMargin = sp > 0 ? sp - totalLanded : 0;
    const marginPct   = sp > 0 ? (grossMargin / sp) * 100 : 0;

    return {
      cifUSD, fobUSD, rate, dutyPct, qty,
      cifTZS, fobTZS,
      importDuty, rdl, cpf, vat,
      totalTax, totalOps, totalLanded,
      perUnit, sp, grossMargin, marginPct,
    };
  }, [tax, costs, sellingPrice]);

  // ── Cost helpers ──────────────────────────────────────────────────────────────
  const updateCost = (id: string, field: keyof CostLine, value: string | number | boolean) =>
    setCosts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));

  const addCost = () => {
    if (!newCostDesc.trim()) return;
    setCosts(prev => [...prev, {
      id: Date.now().toString(),
      description: newCostDesc.trim(),
      amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false,
    }]);
    setNewCostDesc('');
  };

  // ── Document helpers ──────────────────────────────────────────────────────────
  const toggleDoc = (key: string) =>
    setDocs(prev => prev.map(d =>
      d.key === key
        ? { ...d, uploaded: !d.uploaded, uploadDate: !d.uploaded ? new Date().toISOString().split('T')[0] : undefined }
        : d
    ));

  // ── Milestone helpers ─────────────────────────────────────────────────────────
  const cycleMilestone = (key: string) =>
    setMilestones(prev => prev.map(m => {
      if (m.key !== key) return m;
      const next: MilestoneStatus =
        m.status === 'pending' ? 'done' :
        m.status === 'done'    ? 'skipped' : 'pending';
      return {
        ...m,
        status: next,
        date: next === 'done' ? (m.date || new Date().toISOString().split('T')[0]) : m.date,
      };
    }));

  const updateMilestone = (key: string, field: 'date' | 'notes', value: string) =>
    setMilestones(prev => prev.map(m => m.key === key ? { ...m, [field]: value } : m));

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const inputCls = 'w-full bg-black/30 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all';
  const labelCls = 'block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5';

  // ── Derived counts ────────────────────────────────────────────────────────────
  const doneCount    = milestones.filter(m => m.status === 'done').length;
  const docsDone     = docs.filter(d => d.uploaded).length;
  const totalOps     = costs.reduce((s, c) => s + c.amountTZS, 0);

  // ── Loading / not found ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 text-brand-accent animate-spin" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="w-full max-w-4xl mx-auto px-6 pt-10 pb-28 md:pb-10">
        <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-brand-text-muted hover:text-brand-accent transition-colors mb-8">
          <ArrowLeft className="w-3.5 h-3.5" /> Shipments
        </button>
        <p className="text-brand-text-muted font-mono text-sm">Shipment not found.</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 pt-8 pb-28 md:pb-10 overflow-x-hidden box-border space-y-4">

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-brand-text-muted hover:text-brand-accent transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Shipments
      </button>

      {/* ── Summary card ────────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-5 md:p-7 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent/40 to-transparent" />

        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`px-3 py-1 rounded-lg text-[9px] font-mono font-bold uppercase border ${
            shipment.type === 'import'
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
              : 'bg-brand-accent/10 text-brand-accent border-brand-accent/30'
          }`}>{shipment.type}</span>
          <span className={`px-3 py-1 rounded-lg text-[9px] font-mono font-bold uppercase border ${STATUS_BADGE[shipment.status] ?? STATUS_BADGE.draft}`}>
            {STATUS_LABELS[shipment.status] ?? shipment.status}
          </span>
          {shipment.year && (
            <span className="px-3 py-1 rounded-lg text-[9px] font-mono font-bold uppercase border border-brand-border text-brand-text-muted">
              {shipment.year}
            </span>
          )}
        </div>

        <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-tighter leading-none mb-2">
          {shipment.commodity ?? 'Unknown Commodity'}
        </h1>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-brand-text-muted mb-6">
          <span>{shipment.origin_country ?? '?'}</span>
          <ArrowRight className="w-3 h-3 text-brand-accent flex-shrink-0" />
          <span>{shipment.destination_country ?? '?'}</span>
          {shipment.supplier && <><span className="text-brand-border">·</span><span>{shipment.supplier}</span></>}
          {shipment.buyer    && <><span className="text-brand-border">·</span><span>{shipment.buyer}</span></>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'CIF Value (TZS)',  value: calc.cifTZS   > 0 ? `TSh ${fmt(calc.cifTZS)}`   : '—' },
            { label: 'Total Tax Est.',   value: calc.totalTax > 0 ? `TSh ${fmt(calc.totalTax)}`  : '—' },
            { label: 'Operational Costs',value: totalOps      > 0 ? `TSh ${fmt(totalOps)}`       : '—' },
            { label: 'Milestones',       value: `${doneCount} / ${milestones.length}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-black/30 rounded-xl px-3 py-3 border border-brand-border/40">
              <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1">{label}</div>
              <div className="text-sm font-bold font-mono text-white">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 1. Shipment Details ──────────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader
          title="Shipment Details"
          icon={<Package className="w-4 h-4" />}
          open={open.has('details')}
          onToggle={() => toggle('details')}
        />
        {open.has('details') && (
          <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
            {([
              ['B/L Number',     shipment.bl_number],
              ['Container #',    shipment.container_number],
              ['Container Type', shipment.container_type],
              ['HS Code',        shipment.hs_code],
              ['Product Type',   shipment.product_type],
              ['Year',           shipment.year],
            ] as [string, string | number | null][]).map(([label, value]) => (
              <div key={label} className="bg-black/25 rounded-xl px-4 py-3 border border-brand-border/40">
                <div className={labelCls}>{label}</div>
                <div className="text-sm font-mono text-white">{value ?? '—'}</div>
              </div>
            ))}
            {shipment.notes && (
              <div className="col-span-2 md:col-span-3 bg-black/25 rounded-xl px-4 py-3 border border-brand-border/40">
                <div className={labelCls}>Notes</div>
                <div className="text-xs font-mono text-brand-text-muted leading-relaxed">{shipment.notes}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 2. TRA Tax Calculator ────────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader
          title="TRA Tax Calculator"
          icon={<Calculator className="w-4 h-4" />}
          open={open.has('tax')}
          onToggle={() => toggle('tax')}
        />
        {open.has('tax') && (
          <div className="p-5 space-y-5">

            {/* Disclaimer */}
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[9px] font-mono text-amber-400 leading-relaxed">
                DISCLAIMER: These are estimates only. Actual TRA assessment may differ based on HS classification, granted exemptions, and prevailing rates. Always verify with your licensed clearing agent.
              </p>
            </div>

            {/* Inputs */}
            <div>
              <p className={`${labelCls} mb-3`}>Inputs</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>CIF Value (USD)</label>
                  <input type="number" min="0" placeholder="0.00" value={tax.cifUSD}
                    onChange={e => setTax(p => ({ ...p, cifUSD: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>FOB Value (USD)</label>
                  <input type="number" min="0" placeholder="0.00" value={tax.fobUSD}
                    onChange={e => setTax(p => ({ ...p, fobUSD: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>USD → TZS Rate</label>
                  <input type="number" min="0" placeholder="e.g. 2600" value={tax.exchangeRate}
                    onChange={e => setTax(p => ({ ...p, exchangeRate: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Import Duty Rate %</label>
                  <input type="number" min="0" max="100" placeholder="0 / 10 / 25" value={tax.dutyRate}
                    onChange={e => setTax(p => ({ ...p, dutyRate: e.target.value }))} className={inputCls} />
                  <p className="text-[8px] font-mono text-brand-text-muted mt-1">EAC CET: 0%, 10%, or 25% — check your HS code</p>
                </div>
                <div>
                  <label className={labelCls}>Exemption</label>
                  <select value={tax.exemption}
                    onChange={e => setTax(p => ({ ...p, exemption: e.target.value as TaxInputs['exemption'] }))}
                    className={inputCls}
                  >
                    <option value="none">None</option>
                    <option value="partial">Partial</option>
                    <option value="full">Full</option>
                  </select>
                </div>
                {tax.exemption === 'partial' && (
                  <div>
                    <label className={labelCls}>Exemption Reduction %</label>
                    <input type="number" min="0" max="100" placeholder="50" value={tax.partialPct}
                      onChange={e => setTax(p => ({ ...p, partialPct: e.target.value }))} className={inputCls} />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Quantity (units)</label>
                  <input type="number" min="1" placeholder="1" value={tax.quantity}
                    onChange={e => setTax(p => ({ ...p, quantity: e.target.value }))} className={inputCls} />
                  <p className="text-[8px] font-mono text-brand-text-muted mt-1">For cost-per-unit calculation</p>
                </div>
              </div>
            </div>

            {/* Results — only show when CIF is entered */}
            {calc.cifTZS > 0 && (
              <div>
                <p className={`${labelCls} mb-3`}>Calculated Taxes</p>
                <div className="space-y-2">

                  {/* CIF TZS */}
                  <TaxLine
                    label="CIF Value (TZS)"
                    formula={`${fmtD(calc.cifUSD)} × ${fmt(calc.rate)} = TSh ${fmt(calc.cifTZS)}`}
                    value={`TSh ${fmt(calc.cifTZS)}`}
                    highlight={false}
                  />

                  {/* Import Duty */}
                  <TaxLine
                    label={`Import Duty${tax.exemption !== 'none' ? ` (${tax.exemption === 'full' ? 'full' : 'partial'} exemption)` : ''}`}
                    formula={
                      tax.exemption === 'full'
                        ? 'Full exemption applied — TSh 0'
                        : tax.exemption === 'partial'
                        ? `TSh ${fmt(calc.cifTZS)} × ${calc.dutyPct}% × ${100 - parseFloat(tax.partialPct || '0')}% effective`
                        : `TSh ${fmt(calc.cifTZS)} × ${calc.dutyPct}%`
                    }
                    value={`TSh ${fmt(calc.importDuty)}`}
                    highlight={false}
                    accent={calc.importDuty === 0}
                  />

                  {/* RDL */}
                  <TaxLine
                    label="RDL — Railway Development Levy"
                    formula={`TSh ${fmt(calc.cifTZS)} × 2%`}
                    value={`TSh ${fmt(calc.rdl)}`}
                    highlight={false}
                  />

                  {/* CPF */}
                  <TaxLine
                    label="CPF — Customs Processing Fee"
                    formula={
                      calc.fobTZS > 0
                        ? `FOB TSh ${fmt(calc.fobTZS)} × 0.6%`
                        : 'Enter FOB value to calculate'
                    }
                    value={`TSh ${fmt(calc.cpf)}`}
                    highlight={false}
                    muted={calc.fobTZS === 0}
                  />

                  {/* VAT */}
                  <TaxLine
                    label="VAT (18%)"
                    formula={`(CIF TSh ${fmt(calc.cifTZS)} + Duty TSh ${fmt(calc.importDuty)}) × 18%`}
                    value={`TSh ${fmt(calc.vat)}`}
                    highlight={false}
                  />

                  {/* Total tax — green highlight */}
                  <div className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-brand-accent/5 border border-brand-accent/30">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-accent">
                      Total Tax Estimate
                    </div>
                    <div className="text-lg font-bold font-mono text-brand-accent">TSh {fmt(calc.totalTax)}</div>
                  </div>

                  {/* Total landed */}
                  <div className="flex items-start justify-between px-4 py-3.5 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white">Total Landed Cost</div>
                      <div className="text-[8px] font-mono text-brand-text-muted mt-0.5">
                        CIF TSh {fmt(calc.cifTZS)} + Tax TSh {fmt(calc.totalTax)} + Ops TSh {fmt(calc.totalOps)}
                      </div>
                    </div>
                    <div className="text-lg font-bold font-mono text-white ml-4">TSh {fmt(calc.totalLanded)}</div>
                  </div>

                  {/* Per unit */}
                  {calc.qty > 1 && (
                    <TaxLine
                      label={`Cost Per Unit (÷ ${fmt(calc.qty)} units)`}
                      formula={`TSh ${fmt(calc.totalLanded)} ÷ ${fmt(calc.qty)}`}
                      value={`TSh ${fmt(calc.perUnit)}`}
                      highlight={false}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 3. Cost Tracker ──────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader
          title={`Cost Tracker — ${costs.length} lines · TSh ${fmt(totalOps)}`}
          icon={<DollarSign className="w-4 h-4" />}
          open={open.has('costs')}
          onToggle={() => toggle('costs')}
        />
        {open.has('costs') && (
          <div className="p-4 space-y-2">

            {/* Column headers — desktop only */}
            <div className="hidden md:grid grid-cols-[1fr_140px_110px_52px_60px_28px] gap-2 px-3 mb-1">
              {['Description', 'Amount TZS', 'Amount USD', 'Paid', 'Receipt', ''].map(h => (
                <div key={h} className="text-[8px] font-mono uppercase tracking-[0.15em] text-brand-text-muted">{h}</div>
              ))}
            </div>

            {costs.map(c => (
              <div key={c.id} className="grid grid-cols-1 md:grid-cols-[1fr_140px_110px_52px_60px_28px] gap-2 px-3 py-2.5 bg-black/20 rounded-xl border border-brand-border/30">
                <input
                  value={c.description}
                  onChange={e => updateCost(c.id, 'description', e.target.value)}
                  className="bg-transparent text-xs font-mono text-white focus:outline-none border-b border-transparent focus:border-brand-accent/30 transition-all"
                />
                <input
                  type="number" min="0" placeholder="0"
                  value={c.amountTZS || ''}
                  onChange={e => updateCost(c.id, 'amountTZS', parseFloat(e.target.value) || 0)}
                  className="bg-black/30 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none border border-brand-border/40 focus:border-brand-accent/40 transition-all"
                />
                <input
                  type="number" min="0" placeholder="0"
                  value={c.amountUSD || ''}
                  onChange={e => updateCost(c.id, 'amountUSD', parseFloat(e.target.value) || 0)}
                  className="bg-black/30 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none border border-brand-border/40 focus:border-brand-accent/40 transition-all"
                />
                <button
                  onClick={() => updateCost(c.id, 'paid', !c.paid)}
                  className={`rounded-lg py-1.5 text-[9px] font-mono font-bold uppercase border transition-all ${
                    c.paid
                      ? 'bg-brand-accent/10 text-brand-accent border-brand-accent/30'
                      : 'bg-black/20 text-brand-text-muted border-brand-border/40 hover:border-brand-text-muted'
                  }`}
                >
                  {c.paid ? '✓' : '—'}
                </button>
                <button
                  onClick={() => updateCost(c.id, 'hasReceipt', !c.hasReceipt)}
                  className={`rounded-lg py-1.5 text-[9px] font-mono font-bold uppercase border transition-all ${
                    c.hasReceipt
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                      : 'bg-black/20 text-brand-text-muted border-brand-border/40 hover:border-brand-text-muted'
                  }`}
                >
                  {c.hasReceipt ? '✓ Doc' : '—'}
                </button>
                <button
                  onClick={() => setCosts(prev => prev.filter(x => x.id !== c.id))}
                  className="flex items-center justify-center text-brand-text-muted hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* Totals row */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-brand-accent/5 border border-brand-accent/20 mt-1">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-accent">Total Operational Costs</span>
                <span className="text-[8px] font-mono text-brand-text-muted ml-3">
                  {costs.filter(c => c.paid).length}/{costs.length} paid
                </span>
              </div>
              <span className="text-sm font-bold font-mono text-brand-accent">TSh {fmt(totalOps)}</span>
            </div>

            {/* Add cost */}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Add cost line description..."
                value={newCostDesc}
                onChange={e => setNewCostDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCost()}
                className={`${inputCls} flex-1`}
              />
              <button
                onClick={addCost}
                className="px-4 py-2 rounded-lg bg-brand-accent/10 text-brand-accent border border-brand-accent/30 hover:bg-brand-accent/20 transition-all text-xs font-mono font-bold flex items-center gap-1.5 flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. Document Checklist ────────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader
          title={`Document Checklist — ${docsDone} / ${docs.length} uploaded`}
          icon={<FileText className="w-4 h-4" />}
          open={open.has('docs')}
          onToggle={() => toggle('docs')}
        />
        {open.has('docs') && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
            {docs.map(doc => (
              <div
                key={doc.key}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  doc.uploaded
                    ? 'bg-brand-accent/5 border-brand-accent/20'
                    : 'bg-black/20 border-brand-border/30'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border ${
                    doc.uploaded ? 'bg-brand-accent border-brand-accent' : 'bg-transparent border-brand-border'
                  }`}>
                    {doc.uploaded && <Check className="w-3 h-3 text-black" />}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-[10px] font-mono font-bold uppercase truncate ${
                      doc.uploaded ? 'text-brand-accent' : 'text-brand-text-muted'
                    }`}>
                      {doc.label}
                    </div>
                    {doc.uploadDate && (
                      <div className="text-[8px] font-mono text-brand-text-muted mt-0.5">
                        Marked {doc.uploadDate}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toggleDoc(doc.key)}
                  className={`flex-shrink-0 px-3 py-1 rounded-lg text-[8px] font-mono font-bold uppercase border transition-all ml-2 ${
                    doc.uploaded
                      ? 'border-brand-accent/30 text-brand-accent hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                      : 'border-brand-border text-brand-text-muted hover:border-brand-accent/40 hover:text-brand-accent'
                  }`}
                >
                  {doc.uploaded ? '✓ Done' : 'Mark'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 5. Milestones Timeline ───────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader
          title={`Milestones — ${doneCount} / ${milestones.length} completed`}
          icon={<CheckSquare className="w-4 h-4" />}
          open={open.has('milestones')}
          onToggle={() => toggle('milestones')}
        />
        {open.has('milestones') && (
          <div className="p-4">
            <p className="text-[8px] font-mono text-brand-text-muted uppercase tracking-widest mb-4 px-1">
              Tap circle to cycle: Pending → Done → Skipped
            </p>
            <div className="space-y-0">
              {milestones.map((m, i) => {
                const isLast   = i === milestones.length - 1;
                const isEditing = editingMilestone === m.key;
                return (
                  <div key={m.key} className="flex items-start gap-3">
                    {/* Dot + connector */}
                    <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
                      <button
                        onClick={() => cycleMilestone(m.key)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                          m.status === 'done'
                            ? 'bg-brand-accent/20 border-brand-accent shadow-[0_0_10px_rgba(0,255,102,0.25)]'
                            : m.status === 'skipped'
                            ? 'bg-neutral-800/60 border-neutral-700'
                            : 'bg-transparent border-brand-border hover:border-brand-accent/40'
                        }`}
                      >
                        {m.status === 'done'    && <Check className="w-3 h-3 text-brand-accent" />}
                        {m.status === 'skipped' && <X className="w-3 h-3 text-neutral-500" />}
                      </button>
                      {!isLast && (
                        <div className={`w-px flex-1 min-h-[24px] my-1 ${
                          m.status === 'done' ? 'bg-brand-accent/30' : 'bg-brand-border'
                        }`} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-mono uppercase tracking-widest ${
                          m.status === 'done'    ? 'text-brand-accent font-bold' :
                          m.status === 'skipped' ? 'text-neutral-600 line-through' :
                                                   'text-brand-text-muted'
                        }`}>
                          {m.label}
                        </span>
                        {m.date && m.status === 'done' && (
                          <span className="text-[8px] font-mono text-brand-text-muted">{m.date}</span>
                        )}
                        {m.status === 'done' && (
                          <button
                            onClick={() => setEditingMilestone(isEditing ? null : m.key)}
                            className="text-brand-text-muted hover:text-brand-accent transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Inline edit: date + notes */}
                      {(isEditing || (m.status === 'done' && !m.date)) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <input
                            type="date"
                            value={m.date || ''}
                            onChange={e => updateMilestone(m.key, 'date', e.target.value)}
                            className="bg-black/30 border border-brand-border/40 rounded-lg px-2 py-1 text-[9px] font-mono text-white focus:outline-none focus:border-brand-accent/40"
                          />
                          <input
                            type="text"
                            placeholder="Add notes..."
                            value={m.notes || ''}
                            onChange={e => updateMilestone(m.key, 'notes', e.target.value)}
                            className="flex-1 min-w-[140px] bg-black/30 border border-brand-border/40 rounded-lg px-2 py-1 text-[9px] font-mono text-white focus:outline-none focus:border-brand-accent/40"
                          />
                        </div>
                      )}
                      {m.notes && !isEditing && (
                        <div className="text-[8px] font-mono text-brand-text-muted mt-1 italic">{m.notes}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── 6. Profitability Summary ─────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader
          title="Profitability Summary"
          icon={<TrendingUp className="w-4 h-4" />}
          open={open.has('profit')}
          onToggle={() => toggle('profit')}
        />
        {open.has('profit') && (
          <div className="p-5 space-y-4">
            <div>
              <label className={labelCls}>Selling Price / Total Revenue (TZS)</label>
              <input
                type="number" min="0" placeholder="0"
                value={sellingPrice}
                onChange={e => setSellingPrice(e.target.value)}
                className={`${inputCls} md:max-w-xs`}
              />
            </div>

            <div className="space-y-2">
              {[
                { label: 'CIF Value',          value: calc.cifTZS,    color: 'text-white',    bold: false },
                { label: 'Total Taxes (est.)', value: calc.totalTax,  color: 'text-red-400',  bold: false },
                { label: 'Operational Costs',  value: calc.totalOps,  color: 'text-amber-400',bold: false },
                { label: 'Total Landed Cost',  value: calc.totalLanded,color:'text-white',    bold: true  },
              ].map(({ label, value, color, bold }) => (
                <div
                  key={label}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border border-brand-border/40 bg-black/25 ${bold ? 'border-white/15' : ''}`}
                >
                  <div className={`text-[10px] font-mono uppercase tracking-widest text-brand-text-muted ${bold ? 'font-bold' : ''}`}>
                    {label}
                  </div>
                  <div className={`text-sm font-bold font-mono ${color}`}>TSh {fmt(value)}</div>
                </div>
              ))}

              {calc.sp > 0 && (
                <>
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-brand-border/40 bg-black/25">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-brand-text-muted">Revenue</div>
                    <div className="text-sm font-bold font-mono text-blue-400">TSh {fmt(calc.sp)}</div>
                  </div>
                  <div className={`flex items-center justify-between px-4 py-3.5 rounded-xl border ${
                    calc.grossMargin >= 0
                      ? 'bg-brand-accent/5 border-brand-accent/30'
                      : 'bg-red-500/5 border-red-500/30'
                  }`}>
                    <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-text-muted">
                      Gross Margin
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold font-mono ${calc.grossMargin >= 0 ? 'text-brand-accent' : 'text-red-400'}`}>
                        TSh {fmt(Math.abs(calc.grossMargin))}{calc.grossMargin < 0 ? ' (Loss)' : ''}
                      </div>
                      <div className={`text-[9px] font-mono ${calc.grossMargin >= 0 ? 'text-brand-accent/70' : 'text-red-400/70'}`}>
                        {calc.marginPct.toFixed(1)}% margin
                      </div>
                    </div>
                  </div>
                </>
              )}

              {calc.qty > 1 && calc.totalLanded > 0 && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-brand-border/40 bg-black/25">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-brand-text-muted">
                    Cost Per Unit ({fmt(calc.qty)} units)
                  </div>
                  <div className="text-sm font-bold font-mono text-white">TSh {fmt(calc.perUnit)}</div>
                </div>
              )}
            </div>
          </div>
        )}
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

// ─── Small helper: one tax result row ────────────────────────────────────────

function TaxLine({
  label, formula, value, highlight, accent, muted,
}: {
  label: string;
  formula: string;
  value: string;
  highlight: boolean;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between px-4 py-3 rounded-xl border ${
      highlight ? 'bg-brand-accent/5 border-brand-accent/30' : 'bg-black/25 border-brand-border/40'
    }`}>
      <div className="mr-4 min-w-0">
        <div className="text-[9px] font-mono text-brand-text-muted uppercase tracking-widest">{label}</div>
        <div className="text-[8px] font-mono text-brand-border mt-0.5 break-words">{formula}</div>
      </div>
      <div className={`text-sm font-bold font-mono flex-shrink-0 ${
        muted   ? 'text-brand-text-muted' :
        accent  ? 'text-brand-accent' :
        highlight ? 'text-brand-accent' : 'text-white'
      }`}>
        {value}
      </div>
    </div>
  );
}
