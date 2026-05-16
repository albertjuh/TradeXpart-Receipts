import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';

type Props = {
  onClose: () => void;
  onCreated: () => void;
};

type FormData = {
  type: 'import' | 'export';
  status: 'draft' | 'in_transit' | 'at_customs' | 'cleared' | 'delivered' | 'cancelled';
  commodity: string;
  product_type: string;
  year: string;
  origin_country: string;
  destination_country: string;
  supplier: string;
  buyer: string;
  container_type: string;
  bl_number: string;
  container_number: string;
  hs_code: string;
  notes: string;
};

const INITIAL: FormData = {
  type: 'import',
  status: 'draft',
  commodity: '',
  product_type: '',
  year: String(new Date().getFullYear()),
  origin_country: '',
  destination_country: '',
  supplier: '',
  buyer: '',
  container_type: '',
  bl_number: '',
  container_number: '',
  hs_code: '',
  notes: '',
};

const inputClass =
  'w-full bg-[#0d0d0d] border border-[#1f1f1f] rounded-xl px-4 py-2.5 text-sm font-mono text-[#e5e7eb] placeholder-[#4b5563] focus:outline-none focus:border-[var(--color-brand-accent,#00ff66)]/50 focus:ring-2 focus:ring-[var(--color-brand-accent,#00ff66)]/10 transition-all';

const labelClass = 'block text-[9px] font-mono uppercase tracking-[0.2em] text-[#6b7280] mb-1.5';

export default function CreateShipmentModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.commodity.trim()) { setError('Commodity is required.'); return; }

    setSubmitting(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      type: form.type,
      status: form.status,
      commodity: form.commodity.trim() || null,
      product_type: form.product_type.trim() || null,
      year: form.year ? Number(form.year) : null,
      origin_country: form.origin_country.trim() || null,
      destination_country: form.destination_country.trim() || null,
      supplier: form.supplier.trim() || null,
      buyer: form.buyer.trim() || null,
      container_type: form.container_type || null,
      bl_number: form.bl_number.trim() || null,
      container_number: form.container_number.trim() || null,
      hs_code: form.hs_code.trim() || null,
      notes: form.notes.trim() || null,
      created_by: user?.id ?? null,
    };

    const { error: dbError } = await supabase.from('shipments').insert(payload);

    if (dbError) {
      setError(dbError.message);
      setSubmitting(false);
    } else {
      onCreated();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
        onClick={() => !submitting && onClose()}
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#111111] border border-[#1f1f1f] rounded-3xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-[#1f1f1f]">
          <div>
            <h2 className="text-xl font-bold uppercase tracking-tighter text-[#e5e7eb]">New Shipment</h2>
            <p className="text-[10px] font-mono text-[#6b7280] uppercase tracking-widest mt-1">
              Fill in details to create a shipment record
            </p>
          </div>
          {!submitting && (
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl text-[#6b7280] hover:text-[#e5e7eb] hover:bg-[#1f1f1f] transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {/* Row 1: type + status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Type</label>
              <select value={form.type} onChange={set('type')} className={inputClass}>
                <option value="import">Import</option>
                <option value="export">Export</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select value={form.status} onChange={set('status')} className={inputClass}>
                <option value="draft">Draft</option>
                <option value="in_transit">In Transit</option>
                <option value="at_customs">At Customs</option>
                <option value="cleared">Cleared</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Row 2: commodity + product_type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Commodity *</label>
              <input
                type="text"
                placeholder="e.g. Timber, Electronics"
                value={form.commodity}
                onChange={set('commodity')}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Product Type</label>
              <input
                type="text"
                placeholder="e.g. Raw material"
                value={form.product_type}
                onChange={set('product_type')}
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 3: year + container_type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Year</label>
              <input
                type="number"
                placeholder="2025"
                value={form.year}
                onChange={set('year')}
                className={inputClass}
                min={2000}
                max={2100}
              />
            </div>
            <div>
              <label className={labelClass}>Container Type</label>
              <select value={form.container_type} onChange={set('container_type')} className={inputClass}>
                <option value="">— Select —</option>
                <option value="20ft">20ft</option>
                <option value="40ft">40ft</option>
                <option value="40ft HC">40ft HC</option>
                <option value="LCL">LCL</option>
                <option value="bulk">Bulk</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Row 4: origin + destination */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Origin Country</label>
              <input
                type="text"
                placeholder="e.g. China"
                value={form.origin_country}
                onChange={set('origin_country')}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Destination Country</label>
              <input
                type="text"
                placeholder="e.g. Tanzania"
                value={form.destination_country}
                onChange={set('destination_country')}
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 5: supplier + buyer */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Supplier</label>
              <input
                type="text"
                placeholder="Supplier name"
                value={form.supplier}
                onChange={set('supplier')}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Buyer</label>
              <input
                type="text"
                placeholder="Buyer name"
                value={form.buyer}
                onChange={set('buyer')}
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 6: bl_number + container_number */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>B/L Number</label>
              <input
                type="text"
                placeholder="Bill of Lading #"
                value={form.bl_number}
                onChange={set('bl_number')}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Container Number</label>
              <input
                type="text"
                placeholder="e.g. TCKU1234567"
                value={form.container_number}
                onChange={set('container_number')}
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 7: hs_code */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>HS Code</label>
              <input
                type="text"
                placeholder="e.g. 4407.10"
                value={form.hs_code}
                onChange={set('hs_code')}
                className={inputClass}
              />
            </div>
          </div>

          {/* Notes — full width */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              placeholder="Any additional notes..."
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-[10px] font-mono text-red-400 uppercase tracking-widest">{error}</p>
          )}

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#1f1f1f] mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl text-[10px] font-mono uppercase tracking-widest text-[#6b7280] border border-[#1f1f1f] hover:border-[#374151] hover:text-[#e5e7eb] transition-all disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl text-[10px] font-mono uppercase tracking-widest bg-[var(--color-brand-accent,#00ff66)] text-black font-bold hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:scale-100 flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
              Create Shipment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
