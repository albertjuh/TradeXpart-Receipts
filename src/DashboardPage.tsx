import React, { useState, useEffect } from 'react';
import {
  Package, Wallet, Clock, Plus, ArrowRight,
  TrendingUp, CheckCircle, AlertCircle, Loader2,
  Activity, FileText, BarChart3,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from './supabase';
import type { Shipment } from './ShipmentsPage';
import type { Receipt } from './types';
import type { Sale } from './SalesPage';
import { toTZS } from './currency';

type Props = {
  receipts: Receipt[];
  sales: Sale[];
  userName: string;
  onNewShipment: () => void;
  onAddReceipt: () => void;
  onGoToReceipts: () => void;
  onGoToShipments: () => void;
  onSelectShipment: (id: string) => void;
};

const STATUS_COLORS: Record<string, string> = {
  draft:      'text-neutral-400',
  in_transit: 'text-blue-400',
  at_customs: 'text-amber-400',
  cleared:    'text-purple-400',
  delivered:  'text-brand-accent',
  cancelled:  'text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', in_transit: 'In Transit', at_customs: 'At Customs',
  cleared: 'Cleared', delivered: 'Delivered', cancelled: 'Cancelled',
};

const ACTIVE_STATUSES = new Set(['draft', 'in_transit', 'at_customs', 'cleared']);

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  const first = name.split(' ')[0];
  return `Good ${part}, ${first}`;
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function thisMonthTotal(receipts: Receipt[]) {
  const now = new Date();
  return receipts
    .filter(r => {
      try {
        const d = new Date(r.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      } catch { return false; }
    })
    .reduce((s, r) => s + toTZS(r.amount, r.currency), 0);
}

function thisMonthRevenue(sales: Sale[]) {
  const now = new Date();
  return sales
    .filter(s => {
      try {
        const d = new Date(s.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      } catch { return false; }
    })
    .reduce((s, r) => s + toTZS(r.amount, r.currency), 0);
}

function monthlySeries(receipts: Receipt[], sales: Sale[]) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'short' }) };
  });

  return months.map(m => {
    const inMonth = (dateStr: string) => {
      try {
        const d = new Date(dateStr);
        return d.getFullYear() === m.year && d.getMonth() === m.month;
      } catch { return false; }
    };
    const Expenses = receipts.filter(r => inMonth(r.date)).reduce((s, r) => s + toTZS(r.amount, r.currency), 0);
    const Revenue = sales.filter(s => inMonth(s.date)).reduce((s, r) => s + toTZS(r.amount, r.currency), 0);
    return { month: m.label, Revenue, Expenses };
  });
}

export default function DashboardPage({
  receipts, sales, userName,
  onNewShipment, onAddReceipt, onGoToReceipts, onGoToShipments, onSelectShipment,
}: Props) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [shipmentsError, setShipmentsError] = useState<string | null>(null);

  const fetchShipments = async () => {
    try {
      console.log('Fetching shipments...');
      setShipmentsError(null);
      setLoadingShipments(true);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout after 5s')), 5000)
      );
      const query = supabase.from('shipments').select('*').order('created_at', { ascending: false }).limit(20);
      const { data, error } = await Promise.race([query, timeout]) as Awaited<typeof query>;
      console.log('Shipments result:', data, error);
      if (error) throw error;
      setShipments(data as Shipment[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('fetchShipments FAILED:', msg);
      setShipmentsError(msg);
    } finally {
      setLoadingShipments(false);
    }
  };

  useEffect(() => { fetchShipments(); }, []);

  const activeShipments = shipments.filter(s => ACTIVE_STATUSES.has(s.status));
  const pendingReceipts = receipts.filter(r => r.status === 'pending').length;
  const monthTotal = thisMonthTotal(receipts);
  const monthRevenue = thisMonthRevenue(sales);

  const recentReceipts = [...receipts]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const recentShipments = shipments.slice(0, 3);
  const series = monthlySeries(receipts, sales);

  const stats = [
    {
      label: 'Total Shipments',
      value: loadingShipments ? '—' : String(shipments.length),
      icon: <Package className="w-5 h-5" />,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
    },
    {
      label: 'Active Shipments',
      value: loadingShipments ? '—' : String(activeShipments.length),
      icon: <Activity className="w-5 h-5" />,
      color: 'text-brand-accent',
      bg: 'bg-brand-accent/10 border-brand-accent/20',
    },
    {
      label: 'Expenses This Month',
      value: `TSh ${monthTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      icon: <Wallet className="w-5 h-5" />,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
    },
    {
      label: 'Revenue This Month',
      value: `TSh ${monthRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-brand-accent',
      bg: 'bg-brand-accent/10 border-brand-accent/20',
    },
    {
      label: 'Pending Approvals',
      value: String(pendingReceipts),
      icon: <Clock className="w-5 h-5" />,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10 border-orange-500/20',
    },
  ];

  return (
    <main className="w-full max-w-5xl mx-auto px-4 md:px-6 pt-8 pb-28 md:pb-10 space-y-8 overflow-x-hidden box-border">

      {/* Hero greeting banner */}
      <div className="rounded-3xl p-6 md:p-8 bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg relative overflow-hidden">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tighter leading-none">
              {greeting(userName)}
            </h2>
            <p className="text-[11px] font-mono text-white/80 uppercase tracking-widest mt-1.5">
              {todayLabel()}
            </p>
          </div>
          <div className="flex items-center gap-2.5 bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-2.5 border border-white/20">
            <div className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse flex-shrink-0" />
            <div>
              <div className="text-[8px] font-mono uppercase tracking-widest text-white/70 leading-none mb-0.5">Status</div>
              <div className="text-xs font-bold uppercase tracking-tight leading-none">All Systems Active</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map(s => (
          <div key={s.label} className={`glass rounded-2xl p-4 border ${s.bg}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${s.bg} ${s.color}`}>
              {s.icon}
            </div>
            <div className="text-lg md:text-xl font-bold font-mono tracking-tight leading-none mb-1">
              {s.value}
            </div>
            <div className="text-[9px] font-mono uppercase tracking-[0.15em] text-brand-text-muted leading-snug">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Money overview chart */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-brand-accent" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand-text-muted">Money Overview · Last 6 Months</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={series} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-brand-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--color-brand-text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--color-brand-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
            <Tooltip
              contentStyle={{ background: 'var(--color-brand-card)', border: '1px solid var(--color-brand-border)', borderRadius: 12, fontSize: 11 }}
              formatter={(value: number) => `TSh ${value.toLocaleString()}`}
            />
            <Area type="monotone" dataKey="Revenue" stroke="#10B981" strokeWidth={2} fill="url(#revenueGradient)" />
            <Area type="monotone" dataKey="Expenses" stroke="#EF4444" strokeWidth={2} fill="url(#expensesGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={onNewShipment}
          className="glass rounded-2xl p-4 flex flex-col items-center gap-2.5 hover:border-brand-accent/40 hover:bg-brand-accent/5 transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-accent/10 flex items-center justify-center group-hover:bg-brand-accent/20 transition-all">
            <Package className="w-5 h-5 text-brand-accent" />
          </div>
          <span className="text-[9px] font-mono uppercase tracking-widest text-brand-text-muted group-hover:text-brand-accent transition-colors text-center">
            New Shipment
          </span>
        </button>
        <button
          onClick={onAddReceipt}
          className="glass rounded-2xl p-4 flex flex-col items-center gap-2.5 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-all">
            <Plus className="w-5 h-5 text-blue-400" />
          </div>
          <span className="text-[9px] font-mono uppercase tracking-widest text-brand-text-muted group-hover:text-blue-400 transition-colors text-center">
            Add Receipt
          </span>
        </button>
        <button
          onClick={onGoToReceipts}
          className="glass rounded-2xl p-4 flex flex-col items-center gap-2.5 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-all">
            <BarChart3 className="w-5 h-5 text-amber-400" />
          </div>
          <span className="text-[9px] font-mono uppercase tracking-widest text-brand-text-muted group-hover:text-amber-400 transition-colors text-center">
            View Reports
          </span>
        </button>
      </div>

      {/* Recent activity + system health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Recent receipts */}
        <div className="md:col-span-2 glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-accent" />
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand-text-muted">Recent Receipts</span>
            </div>
            <button
              onClick={onGoToReceipts}
              className="text-[9px] font-mono uppercase tracking-widest text-brand-accent hover:underline flex items-center gap-1"
            >
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {recentReceipts.length === 0 ? (
            <div className="py-10 text-center text-[10px] font-mono text-brand-text-muted uppercase tracking-widest">
              No receipts yet
            </div>
          ) : (
            <div className="divide-y divide-brand-border">
              {recentReceipts.map(r => (
                <div key={r.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-brand-bg border border-brand-border flex items-center justify-center text-[10px] font-bold text-brand-accent uppercase flex-shrink-0">
                      {(r.vendor || '?').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold uppercase truncate">{r.vendor || 'Unknown'}</div>
                      <div className="text-[9px] font-mono text-brand-text-muted">{r.date} · {r.category}</div>
                    </div>
                  </div>
                  <div className="text-[11px] font-bold font-mono flex-shrink-0 ml-3">
                    <span className="text-brand-accent text-[9px] mr-0.5">{r.currency || 'TSh'}</span>
                    {r.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Recent shipments */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-brand-accent" />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand-text-muted">Shipments</span>
              </div>
              <button
                onClick={onGoToShipments}
                className="text-[9px] font-mono uppercase tracking-widest text-brand-accent hover:underline flex items-center gap-1"
              >
                All <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {shipmentsError ? (
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-red-500/40 bg-red-500/8 text-red-400">
                <span className="text-[10px] font-mono">⚠ {shipmentsError}</span>
                <button
                  onClick={fetchShipments}
                  className="flex-shrink-0 text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg border border-red-500/40 hover:bg-red-500/20 transition-all"
                >
                  Retry
                </button>
              </div>
            ) : loadingShipments ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="w-4 h-4 text-brand-accent animate-spin" />
              </div>
            ) : recentShipments.length === 0 ? (
              <div className="py-6 text-center text-[9px] font-mono text-brand-text-muted uppercase tracking-widest">
                No shipments
              </div>
            ) : (
              <div className="divide-y divide-brand-border">
                {recentShipments.map(s => (
                  <button
                    key={s.id}
                    onClick={() => onSelectShipment(s.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase truncate">{s.commodity ?? '—'}</div>
                      <div className="text-[8px] font-mono text-brand-text-muted">{s.origin_country} → {s.destination_country}</div>
                    </div>
                    <span className={`text-[8px] font-mono font-bold uppercase flex-shrink-0 ml-2 ${STATUS_COLORS[s.status] ?? 'text-neutral-400'}`}>
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* System health */}
          <div className="glass rounded-2xl p-4 space-y-3">
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1">System Health</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-brand-accent" />
                <span className="text-[10px] font-mono text-brand-text-muted">Cloud Sync</span>
              </div>
              <span className="text-[9px] font-mono text-brand-accent uppercase font-bold">Active</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] font-mono text-brand-text-muted">Supabase</span>
              </div>
              <span className="text-[9px] font-mono text-blue-400 uppercase font-bold">Connected</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {pendingReceipts > 0
                  ? <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                  : <CheckCircle className="w-3.5 h-3.5 text-brand-accent" />
                }
                <span className="text-[10px] font-mono text-brand-text-muted">Approvals</span>
              </div>
              <span className={`text-[9px] font-mono uppercase font-bold ${pendingReceipts > 0 ? 'text-orange-400' : 'text-brand-accent'}`}>
                {pendingReceipts > 0 ? `${pendingReceipts} Pending` : 'Clear'}
              </span>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
