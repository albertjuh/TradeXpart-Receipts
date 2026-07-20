import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';
import { EXCHANGE_RATES } from '../currency';

type Props = {
  onClose: () => void;
  onCreated: () => void;
};

type FormData = {
  date: string;
  customer: string;
  amount: string;
  currency: string;
  shipment_id: string;
  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_method: string;
  notes: string;
};

const INITIAL: FormData = {
  date: new Date().toISOString().split('T')[0],
  customer: '',
  amount: '',
  currency: 'TZS',
  shipment_id: '',
  payment_status: 'unpaid',
  payment_method: '',
  notes: '',
};

type ShipmentOption = { id: string; commodity: string | null; reference_number: string | null; type: string };

const inputClass =
  'w-full bg-[#0d0d0d] border border-[#1f1f1f] rounded-xl px-4 py-2.5 text-sm font-mono text-[#e5e7eb] placeholder-[#4b5563] focus:outline-none focus:border-[var(--color-brand-accent,#00ff66)]/50 focus:ring-2 focus:ring-[var(--color-brand-accent,#00ff66)]/10 transition-all';

const labelClass = 'block text-[9px] font-mono uppercase tracking-[0.2em] text-[#6b7280] mb-1.5';

export default function CreateSaleModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipments, setShipments] = useState<ShipmentOption[]>([]);

  useEffect(() => {
    supabase.from('shipments').select('id, commodity, reference_number, type')
      .then(({ data }) => setShipments((data ?? []) as ShipmentOption[]));
  }, []);

  const set = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(form.amount);
    if (!amountNum || amountNum <= 0) { setError('Amount must be greater than 0.'); return; }

    setSubmitting(true);
    setError(null);

    const payload = {
      date: form.date,
      customer: form.customer.trim() || null,
      amount: amountNum,
      currency: form.currency,
      shipment_id: form.shipment_id || null,
      payment_status: form.payment_status,
      payment_method: form.payment_method.trim() || null,
      notes: form.notes.trim() || null,
      created_by: null,
    };

    const { error: dbError } = await supabase.from('sales').insert(payload);

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
            <h2 className="text-xl font-bold uppercase tracking-tighter text-[#e5e7eb]">New Sale</h2>
            <p className="text-[10px] font-mono text-[#6b7280] uppercase tracking-widest mt-1">
              Log a revenue / income entry
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
          {/* Row 1: date + customer */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={set('date')}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Customer</label>
              <input
                type="text"
                placeholder="Buyer / customer name"
                value={form.customer}
                onChange={set('customer')}
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 2: amount + currency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Amount *</label>
              <input
                type="number"
                placeholder="0.00"
                value={form.amount}
                onChange={set('amount')}
                className={inputClass}
                min={0}
                step="0.01"
                required
              />
            </div>
            <div>
              <label className={labelClass}>Currency</label>
              <select value={form.currency} onChange={set('currency')} className={inputClass}>
                {Object.keys(EXCHANGE_RATES).map(code => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: linked shipment + payment status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Linked Shipment</label>
              <select value={form.shipment_id} onChange={set('shipment_id')} className={inputClass}>
                <option value="">— No linked shipment —</option>
                {shipments.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.reference_number || s.commodity || s.id} ({s.type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Payment Status</label>
              <select value={form.payment_status} onChange={set('payment_status')} className={inputClass}>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>

          {/* Row 4: payment method */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Payment Method</label>
              <input
                type="text"
                placeholder="e.g. Bank transfer, Cash"
                value={form.payment_method}
                onChange={set('payment_method')}
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
              Log Sale
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
