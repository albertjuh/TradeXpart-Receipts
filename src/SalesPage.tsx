import React, { useState, useEffect } from 'react';
import { Plus, Loader2, TrendingUp, DollarSign, Users, Eye } from 'lucide-react';
import { supabase, getFileUrl } from './supabase';
import CreateSaleModal from './components/CreateSaleModal';

export type Sale = {
  id: string;
  date: string;
  customer: string | null;
  amount: number;
  currency: string;
  shipment_id: string | null;
  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_method: string | null;
  notes: string | null;
  attachment_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const PAYMENT_STYLES: Record<string, string> = {
  unpaid:  'bg-red-500/10 text-red-400 border-red-500/30',
  partial: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  paid:    'bg-brand-accent/10 text-brand-accent border-brand-accent/30',
};

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'UNPAID', partial: 'PARTIAL', paid: 'PAID',
};

type Filter = 'all' | 'unpaid' | 'partial' | 'paid';

type LinkedShipment = { commodity: string | null; reference_number: string | null };

type Props = {
  forceOpenModal?: boolean;
  onForceOpenModalHandled?: () => void;
  totalRevenue: number;
  netProfit: number;
  hasForeignSales: boolean;
  onSaleLogged?: () => void;
  onViewClients?: () => void;
};

export default function SalesPage({
  forceOpenModal = false, onForceOpenModalHandled, totalRevenue, netProfit, hasForeignSales, onSaleLogged, onViewClients,
}: Props) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [shipmentsById, setShipmentsById] = useState<Record<string, LinkedShipment>>({});

  useEffect(() => {
    if (forceOpenModal) {
      setIsModalOpen(true);
      onForceOpenModalHandled?.();
    }
  }, [forceOpenModal]);

  const fetchSales = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) setSales(data as Sale[]);
    setLoading(false);
  };

  useEffect(() => { fetchSales(); }, []);

  useEffect(() => {
    supabase.from('shipments').select('id, commodity, reference_number').then(({ data }) => {
      if (!data) return;
      const map: Record<string, LinkedShipment> = {};
      for (const s of data as { id: string; commodity: string | null; reference_number: string | null }[]) {
        map[s.id] = { commodity: s.commodity, reference_number: s.reference_number };
      }
      setShipmentsById(map);
    });
  }, []);

  const filtered = filter === 'all' ? sales : sales.filter(s => s.payment_status === filter);

  return (
    <main className="w-full max-w-6xl mx-auto px-6 pt-10 pb-28 md:pb-10 overflow-x-hidden box-border space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter">Sales Ledger</h2>
          <p className="text-[11px] font-mono text-brand-text-muted uppercase tracking-widest mt-1">
            {sales.length} RECORDS TOTAL
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onViewClients && (
            <button
              onClick={onViewClients}
              className="border border-brand-border text-brand-text-muted px-4 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 hover:border-brand-accent/40 hover:text-brand-accent transition-all active:scale-95"
            >
              <Users className="w-4 h-4" />
              BY CLIENT
            </button>
          )}
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-brand-accent text-black px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 hover:scale-105 transition-all active:scale-95 shadow-[0_0_30px_rgba(0,255,102,0.2)]"
          >
            <Plus className="w-4 h-4" />
            NEW SALE
          </button>
        </div>
      </div>

      {/* Bento summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass rounded-3xl p-8 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-8">
            <div className="p-2 bg-brand-accent/10 rounded-lg">
              <TrendingUp className="w-4 h-4 text-brand-accent" />
            </div>
            <span className="text-xs font-mono text-brand-text-muted uppercase tracking-widest">Total Revenue</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono text-brand-accent">TSh</span>
            <span className="text-6xl font-bold tracking-tighter tabular-nums">
              {totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          {hasForeignSales && (
            <div className="mt-6 flex items-center gap-1 text-[10px] font-mono text-amber-400 uppercase tracking-widest">
              <span>●</span>
              <span>Converted to TSh</span>
            </div>
          )}
        </div>

        <div className="glass rounded-3xl p-8 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-8">
            <div className={`p-2 rounded-lg ${netProfit >= 0 ? 'bg-brand-accent/10' : 'bg-red-500/10'}`}>
              <DollarSign className={`w-4 h-4 ${netProfit >= 0 ? 'text-brand-accent' : 'text-red-400'}`} />
            </div>
            <span className="text-xs font-mono text-brand-text-muted uppercase tracking-widest">Net Profit</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-mono ${netProfit >= 0 ? 'text-brand-accent' : 'text-red-400'}`}>TSh</span>
            <span className={`text-6xl font-bold tracking-tighter tabular-nums ${netProfit >= 0 ? 'text-white' : 'text-red-400'}`}>
              {netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="mt-6 text-[10px] font-mono text-brand-text-muted uppercase tracking-widest">
            Revenue minus total expenses
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'unpaid', 'partial', 'paid'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all border ${
              filter === f
                ? 'bg-brand-accent text-black border-brand-accent font-bold'
                : 'bg-brand-card text-brand-text-muted border-brand-border hover:border-brand-text-muted'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Content area */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 text-brand-accent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-24 flex flex-col items-center justify-center border-2 border-dashed border-brand-border rounded-3xl">
          <div className="w-16 h-16 bg-brand-card rounded-2xl flex items-center justify-center mb-4 border border-brand-border">
            <TrendingUp className="w-8 h-8 text-brand-border" />
          </div>
          <div className="text-xs font-mono text-brand-text-muted uppercase tracking-widest mb-4">
            No sales recorded yet
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-brand-accent text-[10px] font-mono uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all font-bold"
          >
            <Plus className="w-3 h-3" />
            Log First Sale
          </button>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-border">
                {['Date', 'Customer', 'Amount', 'Linked Shipment', 'Payment', 'File'].map(h => (
                  <th
                    key={h}
                    className="px-5 py-3.5 text-left text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const linked = s.shipment_id ? shipmentsById[s.shipment_id] : null;
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-brand-border last:border-0 hover:bg-white/[0.03] transition-colors ${i % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}
                  >
                    <td className="px-5 py-4 text-[10px] font-mono text-brand-text-muted">{s.date}</td>
                    <td className="px-5 py-4 text-xs font-bold uppercase tracking-tight">{s.customer ?? '—'}</td>
                    <td className="px-5 py-4 text-[11px] font-mono">
                      {s.currency} {s.amount.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-[10px] font-mono text-brand-text-muted">
                      {linked ? (linked.reference_number || linked.commodity || '—') : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold border ${PAYMENT_STYLES[s.payment_status] ?? PAYMENT_STYLES.unpaid}`}>
                        {PAYMENT_LABELS[s.payment_status] ?? s.payment_status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {s.attachment_path ? (
                        <a
                          href={getFileUrl('documents', s.attachment_path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-brand-accent hover:opacity-70 transition-opacity"
                          title="View attachment"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-brand-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <CreateSaleModal
          onClose={() => setIsModalOpen(false)}
          onCreated={() => { setIsModalOpen(false); fetchSales(); onSaleLogged?.(); }}
        />
      )}
    </main>
  );
}
