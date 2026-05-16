import React, { useState, useEffect } from 'react';
import { Plus, Package, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from './supabase';
import CreateShipmentModal from './components/CreateShipmentModal';

type ShipmentStatus = 'draft' | 'in_transit' | 'at_customs' | 'cleared' | 'delivered' | 'cancelled';
type ShipmentType = 'import' | 'export';

export type Shipment = {
  id: string;
  company_id: string | null;
  type: ShipmentType;
  year: number | null;
  commodity: string | null;
  product_type: string | null;
  container_type: string | null;
  origin_country: string | null;
  destination_country: string | null;
  supplier: string | null;
  buyer: string | null;
  status: ShipmentStatus;
  bl_number: string | null;
  container_number: string | null;
  hs_code: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  draft:      'bg-neutral-800/60 text-neutral-400 border-neutral-700',
  in_transit: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  at_customs: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  cleared:    'bg-purple-500/10 text-purple-400 border-purple-500/30',
  delivered:  'bg-brand-accent/10 text-brand-accent border-brand-accent/30',
  cancelled:  'bg-red-500/10 text-red-400 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  draft:      'DRAFT',
  in_transit: 'IN TRANSIT',
  at_customs: 'AT CUSTOMS',
  cleared:    'CLEARED',
  delivered:  'DELIVERED',
  cancelled:  'CANCELLED',
};

type Filter = 'all' | 'import' | 'export';

type Props = {
  forceOpenModal?: boolean;
  onForceOpenModalHandled?: () => void;
};

export default function ShipmentsPage({ forceOpenModal = false, onForceOpenModalHandled }: Props) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (forceOpenModal) {
      setIsModalOpen(true);
      onForceOpenModalHandled?.();
    }
  }, [forceOpenModal]);

  const fetchShipments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) setShipments(data as Shipment[]);
    setLoading(false);
  };

  useEffect(() => { fetchShipments(); }, []);

  const filtered = filter === 'all' ? shipments : shipments.filter(s => s.type === filter);

  return (
    <main className="max-w-6xl mx-auto px-6 pt-10 pb-28 md:pb-10">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter">Shipment Archive</h2>
          <p className="text-[11px] font-mono text-brand-text-muted uppercase tracking-widest mt-1">
            {shipments.length} RECORDS TOTAL
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-brand-accent text-black px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 hover:scale-105 transition-all active:scale-95 shadow-[0_0_30px_rgba(0,255,102,0.2)]"
        >
          <Plus className="w-4 h-4" />
          NEW SHIPMENT
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'import', 'export'] as Filter[]).map(f => (
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
            <Package className="w-8 h-8 text-brand-border" />
          </div>
          <div className="text-xs font-mono text-brand-text-muted uppercase tracking-widest mb-4">
            No shipments found in archive
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-brand-accent text-[10px] font-mono uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all font-bold"
          >
            <Plus className="w-3 h-3" />
            Create First Shipment
          </button>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-border">
                {['Type', 'Commodity', 'Route', 'Party', 'Year', 'Status'].map(h => (
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
              {filtered.map((s, i) => (
                <tr
                  key={s.id}
                  className={`border-b border-brand-border last:border-0 hover:bg-white/[0.02] transition-colors ${
                    i % 2 !== 0 ? 'bg-white/[0.01]' : ''
                  }`}
                >
                  {/* Type badge */}
                  <td className="px-5 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase border ${
                        s.type === 'import'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : 'bg-brand-accent/10 text-brand-accent border-brand-accent/30'
                      }`}
                    >
                      {s.type}
                    </span>
                  </td>

                  {/* Commodity */}
                  <td className="px-5 py-4">
                    <div className="text-xs font-bold uppercase tracking-tight">{s.commodity ?? '—'}</div>
                    {s.product_type && (
                      <div className="text-[9px] font-mono text-brand-text-muted mt-0.5">{s.product_type}</div>
                    )}
                  </td>

                  {/* Route */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                      <span className="text-brand-text-muted">{s.origin_country ?? '?'}</span>
                      <ArrowRight className="w-3 h-3 text-brand-accent flex-shrink-0" />
                      <span className="text-brand-text-muted">{s.destination_country ?? '?'}</span>
                    </div>
                  </td>

                  {/* Party — supplier for imports, buyer for exports */}
                  <td className="px-5 py-4 text-[10px] font-mono text-brand-text-muted">
                    {(s.type === 'import' ? s.supplier : s.buyer) ?? '—'}
                  </td>

                  {/* Year */}
                  <td className="px-5 py-4 text-[10px] font-mono text-brand-text-muted">
                    {s.year ?? '—'}
                  </td>

                  {/* Status badge */}
                  <td className="px-5 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold border ${
                        STATUS_STYLES[s.status] ?? STATUS_STYLES.draft
                      }`}
                    >
                      {STATUS_LABELS[s.status] ?? s.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <CreateShipmentModal
          onClose={() => setIsModalOpen(false)}
          onCreated={() => { setIsModalOpen(false); fetchShipments(); }}
        />
      )}
    </main>
  );
}
