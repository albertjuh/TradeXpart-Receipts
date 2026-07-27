import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { X, Download, Loader2, Check } from 'lucide-react';
import { supabase } from '../supabase';

type Props = {
  receiptCount: number;
  shipmentCount: number;
  onClose: () => void;
};

type ExportStatus = 'idle' | 'loading' | 'done' | 'error';

export default function ExportModal({ receiptCount, shipmentCount, onClose }: Props) {
  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [includeShipments, setIncludeShipments] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleExport = async () => {
    if (!includeReceipts && !includeShipments) return;
    setStatus('loading');
    setErrorMsg('');

    try {
      const workbook = XLSX.utils.book_new();

      if (includeReceipts) {
        let q = supabase
          .from('receipts')
          .select('date, time, vendor, amount, currency, category, account_type, payment_method, notes, status, created_at')
          .order('created_at', { ascending: false });
        if (dateFrom) q = q.gte('date', dateFrom);
        if (dateTo)   q = q.lte('date', dateTo);

        const { data, error } = await q;
        if (error) throw new Error(`Receipts: ${error.message}`);

        const rows = (data ?? []).map(r => ({
          'Date':           r.date ?? '',
          'Time':           r.time ?? '',
          'Vendor':         r.vendor ?? '',
          'Amount':         r.amount ?? 0,
          'Currency':       r.currency ?? '',
          'Category':       r.category ?? '',
          'Account Type':   r.account_type ?? '',
          'Payment Method': r.payment_method ?? '',
          'Notes':          r.notes ?? '',
          'Status':         r.status ?? '',
          'Created At':     r.created_at ?? '',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [10, 8, 24, 12, 10, 14, 14, 16, 30, 10, 22].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(workbook, ws, 'Receipts');
      }

      if (includeShipments) {
        let q = supabase
          .from('shipments')
          .select('reference_number, type, commodity, product_type, container_type, origin_country, destination_country, supplier, buyer, bl_number, container_number, hs_code, status, year, notes, created_at')
          .order('created_at', { ascending: false });
        if (dateFrom) q = q.gte('created_at', dateFrom);
        if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59');

        const { data, error } = await q;
        if (error) throw new Error(`Shipments: ${error.message}`);

        const rows = (data ?? []).map(s => ({
          'Reference':        s.reference_number ?? '',
          'Type':             s.type ?? '',
          'Commodity':        s.commodity ?? '',
          'Product Type':     s.product_type ?? '',
          'Container Type':   s.container_type ?? '',
          'Origin':           s.origin_country ?? '',
          'Destination':      s.destination_country ?? '',
          'Supplier':         s.supplier ?? '',
          'Buyer':            s.buyer ?? '',
          'BL Number':        s.bl_number ?? '',
          'Container Number': s.container_number ?? '',
          'HS Code':          s.hs_code ?? '',
          'Status':           s.status ?? '',
          'Year':             s.year ?? '',
          'Notes':            s.notes ?? '',
          'Created At':       s.created_at ?? '',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [16, 10, 20, 16, 16, 16, 16, 20, 20, 16, 18, 12, 12, 8, 30, 22].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(workbook, ws, 'Shipments');
      }

      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `TradeXparts_Export_${today}.xlsx`);
      setStatus('done');
      setTimeout(onClose, 1800);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Export failed:', msg);
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
        onClick={() => status !== 'loading' && onClose()}
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h2 className="text-lg font-bold font-mono uppercase tracking-tight text-white">Export Data</h2>
            <p className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest mt-0.5">
              Download as Excel (.xlsx)
            </p>
          </div>
          {status !== 'loading' && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-brand-text-muted hover:text-white hover:bg-brand-border/60 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {status === 'done' ? (
          /* Success state */
          <div className="py-8 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center">
              <Check className="w-7 h-7 text-brand-accent" />
            </div>
            <p className="text-sm font-mono font-bold text-brand-accent uppercase tracking-tight">
              Export ready — downloading...
            </p>
          </div>
        ) : status === 'loading' ? (
          /* Loading state */
          <div className="py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-7 h-7 text-brand-accent animate-spin" />
            <p className="text-[11px] font-mono text-brand-text-muted uppercase tracking-widest">
              Preparing export...
            </p>
          </div>
        ) : (
          /* Config state */
          <div className="space-y-6">
            {/* Sheet selection */}
            <div className="space-y-2">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-3">Include</p>
              {[
                { label: 'Receipts', count: receiptCount, checked: includeReceipts, set: setIncludeReceipts },
                { label: 'Shipments', count: shipmentCount, checked: includeShipments, set: setIncludeShipments },
              ].map(({ label, count, checked, set }) => (
                <label
                  key={label}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                    checked
                      ? 'border-brand-accent/40 bg-brand-accent/5'
                      : 'border-brand-border hover:border-brand-text-muted'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                      checked ? 'bg-brand-accent border-brand-accent' : 'border-brand-text-muted'
                    }`}>
                      {checked && <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />}
                    </div>
                    <span className="text-sm font-mono font-bold uppercase tracking-tight text-white">{label}</span>
                  </div>
                  <span className="text-[10px] font-mono text-brand-text-muted">{count} records</span>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={checked}
                    onChange={e => set(e.target.checked)}
                  />
                </label>
              ))}
            </div>

            {/* Date range */}
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-3">
                Date Range <span className="normal-case tracking-normal">(optional)</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[8px] font-mono uppercase tracking-widest text-brand-text-muted mb-1">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-mono uppercase tracking-widest text-brand-text-muted mb-1">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Error */}
            {status === 'error' && (
              <p className="text-[10px] font-mono text-red-400">⚠ {errorMsg}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl border border-brand-border text-brand-text-muted font-mono text-[10px] uppercase tracking-widest hover:border-brand-text-muted hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={!includeReceipts && !includeShipments}
                className="flex-1 py-3 rounded-2xl bg-brand-accent text-black font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:scale-100 flex items-center justify-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
