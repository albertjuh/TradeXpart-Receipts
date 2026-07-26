import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, Users, Truck, Loader2 } from 'lucide-react';
import { supabase } from './supabase';
import type { Sale } from './SalesPage';
import type { Shipment } from './ShipmentsPage';
import { toTZS } from './currency';

type Props = {
  sales: Sale[];
};

const norm = (s: string) => s.trim().toLowerCase();

type CustomerGroup = {
  key: string;
  name: string;
  totalTZS: number;
  saleCount: number;
  paid: number;
  partial: number;
  unpaid: number;
  shipmentIds: Set<string>;
  sales: Sale[];
};

type SupplierGroup = {
  key: string;
  name: string;
  shipmentCount: number;
  commodities: Set<string>;
  lastStatus: string;
  lastDate: string;
  shipments: Shipment[];
};

function CollapsibleCard({
  icon, title, subtitle, right, open, onToggle, children,
}: {
  icon: React.ReactNode; title: string; subtitle: string; right: React.ReactNode;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-brand-accent/10 rounded-lg flex-shrink-0">{icon}</div>
          <div className="text-left min-w-0">
            <div className="text-xs font-bold uppercase tracking-tight truncate">{title}</div>
            <div className="text-[9px] font-mono text-brand-text-muted uppercase tracking-widest mt-0.5">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {right}
          <ChevronDown className={`w-4 h-4 text-brand-text-muted transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
        </div>
      </button>
      {open && <div className="px-5 pb-4 border-t border-brand-border/60">{children}</div>}
    </div>
  );
}

export default function ClientsPage({ sales }: Props) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const [openSupplier, setOpenSupplier] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('shipments').select('*').order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setShipments(data as Shipment[]);
        setLoading(false);
      });
  }, []);

  const customers = useMemo(() => {
    const map = new Map<string, CustomerGroup>();

    const ensure = (rawName: string): CustomerGroup => {
      const key = norm(rawName);
      let g = map.get(key);
      if (!g) {
        g = { key, name: rawName.trim(), totalTZS: 0, saleCount: 0, paid: 0, partial: 0, unpaid: 0, shipmentIds: new Set(), sales: [] };
        map.set(key, g);
      }
      return g;
    };

    for (const s of sales) {
      if (!s.customer || !s.customer.trim()) continue;
      const g = ensure(s.customer);
      g.totalTZS += toTZS(s.amount, s.currency);
      g.saleCount += 1;
      g.sales.push(s);
      if (s.payment_status === 'paid') g.paid += 1;
      else if (s.payment_status === 'partial') g.partial += 1;
      else g.unpaid += 1;
      if (s.shipment_id) g.shipmentIds.add(s.shipment_id);
    }

    for (const sh of shipments) {
      if (sh.type === 'export' && sh.buyer && sh.buyer.trim()) {
        const g = ensure(sh.buyer);
        g.shipmentIds.add(sh.id);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalTZS - a.totalTZS);
  }, [sales, shipments]);

  const suppliers = useMemo(() => {
    const map = new Map<string, SupplierGroup>();

    for (const sh of shipments) {
      if (sh.type !== 'import' || !sh.supplier || !sh.supplier.trim()) continue;
      const key = norm(sh.supplier);
      let g = map.get(key);
      if (!g) {
        g = { key, name: sh.supplier.trim(), shipmentCount: 0, commodities: new Set(), lastStatus: sh.status, lastDate: sh.created_at, shipments: [] };
        map.set(key, g);
      }
      g.shipmentCount += 1;
      g.shipments.push(sh);
      if (sh.commodity) g.commodities.add(sh.commodity);
      if (sh.created_at > g.lastDate) { g.lastDate = sh.created_at; g.lastStatus = sh.status; }
    }

    return Array.from(map.values()).sort((a, b) => b.shipmentCount - a.shipmentCount);
  }, [shipments]);

  if (loading) {
    return (
      <main className="w-full max-w-6xl mx-auto px-6 pt-10 pb-28 md:pb-10 flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 text-brand-accent animate-spin" />
      </main>
    );
  }

  return (
    <main className="w-full max-w-6xl mx-auto px-6 pt-10 pb-28 md:pb-10 overflow-x-hidden box-border space-y-8">
      <div>
        <h2 className="text-2xl font-bold uppercase tracking-tighter">Clients</h2>
        <p className="text-[11px] font-mono text-brand-text-muted uppercase tracking-widest mt-1">
          {customers.length} CUSTOMERS · {suppliers.length} SUPPLIERS
        </p>
      </div>

      {/* Customers */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-accent" />
          <span className="text-xs font-mono text-brand-text-muted uppercase tracking-widest">Customers · Revenue</span>
        </div>

        {customers.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-brand-border rounded-2xl">
            <div className="text-xs font-mono text-brand-text-muted uppercase tracking-widest">No customers yet</div>
          </div>
        ) : (
          <div className="space-y-2">
            {customers.map(c => (
              <CollapsibleCard
                key={c.key}
                icon={<Users className="w-4 h-4 text-brand-accent" />}
                title={c.name}
                subtitle={`${c.saleCount} SALE${c.saleCount === 1 ? '' : 'S'} · ${c.shipmentIds.size} SHIPMENT${c.shipmentIds.size === 1 ? '' : 'S'}`}
                right={
                  <span className="text-sm font-bold font-mono tabular-nums">
                    TSh {c.totalTZS.toLocaleString()}
                  </span>
                }
                open={openCustomer === c.key}
                onToggle={() => setOpenCustomer(openCustomer === c.key ? null : c.key)}
              >
                <div className="pt-4 flex items-center gap-4 text-[9px] font-mono uppercase tracking-widest text-brand-text-muted mb-3">
                  <span className="text-brand-accent">{c.paid} paid</span>
                  <span className="text-amber-400">{c.partial} partial</span>
                  <span className="text-red-400">{c.unpaid} unpaid</span>
                </div>
                <div className="space-y-1.5">
                  {c.sales.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-[10px] font-mono text-brand-text-muted">
                      <span>{s.date}</span>
                      <span className="text-white">{s.currency} {s.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleCard>
            ))}
          </div>
        )}
      </div>

      {/* Suppliers */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-brand-accent" />
          <span className="text-xs font-mono text-brand-text-muted uppercase tracking-widest">Suppliers · Vendors</span>
        </div>

        {suppliers.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-brand-border rounded-2xl">
            <div className="text-xs font-mono text-brand-text-muted uppercase tracking-widest">No suppliers yet</div>
          </div>
        ) : (
          <div className="space-y-2">
            {suppliers.map(s => (
              <CollapsibleCard
                key={s.key}
                icon={<Truck className="w-4 h-4 text-brand-accent" />}
                title={s.name}
                subtitle={Array.from(s.commodities).slice(0, 3).join(', ') || 'No commodity listed'}
                right={
                  <span className="text-sm font-bold font-mono tabular-nums">
                    {s.shipmentCount} shipment{s.shipmentCount === 1 ? '' : 's'}
                  </span>
                }
                open={openSupplier === s.key}
                onToggle={() => setOpenSupplier(openSupplier === s.key ? null : s.key)}
              >
                <div className="pt-4 space-y-1.5">
                  {s.shipments.map(sh => (
                    <div key={sh.id} className="flex items-center justify-between text-[10px] font-mono text-brand-text-muted">
                      <span>{sh.commodity ?? '—'}</span>
                      <span className="text-white uppercase">{sh.status}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleCard>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
