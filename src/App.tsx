import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, PieChart, Trash2, Camera, Loader2, X,
  ChevronRight, ArrowUpRight,
  Activity, Layers, Wallet, LogOut, Package, Pencil, Check,
  Sun, Moon, LayoutDashboard,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import type { Session } from '@supabase/supabase-js';
import { Receipt, CATEGORIES } from './types';
import { supabase } from './supabase';
import Login from './Login';
import ShipmentsPage from './ShipmentsPage';
import ShipmentDetailPage from './ShipmentDetailPage';
import DashboardPage from './DashboardPage';

type Page = 'dashboard' | 'receipts' | 'shipments';

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved === 'light' ? 'light' : 'dark') as 'dark' | 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  return { theme, toggle };
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | 'All'>('All');
  const [dateRange, setDateRange] = useState<'All' | 'This Month' | 'Last Month'>('All');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [driveConnected, setDriveConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [openShipmentModal, setOpenShipmentModal] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Receipt>>({});
  const [isSaving, setIsSaving] = useState(false);

  // OCR scan state (Anthropic)
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [ocrFields, setOcrFields] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const fetchReceipts = async (retries = 3) => {
    try {
      const response = await fetch('/api/sheets/receipts');
      const contentType = response.headers.get('content-type');

      if (response.ok && contentType && contentType.includes('application/json')) {
        const raw = await response.json();
        const mapped: Receipt[] = (Array.isArray(raw) ? raw : []).map((row: Record<string, string>) => ({
          id: row['Receipt ID'] || row['id'] || '',
          date: row['Date'] || row['date'] || '',
          time: row['Time'] || row['time'] || '',
          vendor: row['Vendor'] || row['vendor'] || '',
          amount: parseFloat(row['Amount'] || row['amount'] || '0') || 0,
          currency: row['Currency'] || row['currency'] || 'TSh',
          category: row['Category'] || row['category'] || 'Other',
          account_type: (row['Account Type'] || row['account_type'] || 'Unknown') as Receipt['account_type'],
          payment_method: row['Payment Method'] || row['payment_method'] || undefined,
          submitted_by: row['Submitted By'] || row['submitted_by'] || undefined,
          status: (row['Status'] || row['status'] || 'logged') as Receipt['status'],
          notes: row['Notes'] || row['notes'] || undefined,
        }));
        setReceipts(mapped);
      } else if (response.status === 200 && contentType && contentType.includes('text/html')) {
        if (retries > 0) setTimeout(() => fetchReceipts(retries - 1), 2000);
      } else {
        console.error(`Failed to fetch receipts: ${response.status}`);
      }
    } catch (e) {
      if (retries > 0) setTimeout(() => fetchReceipts(retries - 1), 2000);
      else console.error('Failed to fetch receipts after retries', e);
    }
  };

  const checkDriveStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      if (response.ok) {
        const data = await response.json();
        setDriveConnected(data.connected);
      }
    } catch (e) {
      console.error('Failed to check drive status', e);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchReceipts();
      checkDriveStatus();
    }, 1000);
    const interval = setInterval(() => fetchReceipts(0), 10000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, []);

  const handleScanDrive = async () => {
    setIsScanning(true);
    try {
      const response = await fetch('/api/drive/scan', { method: 'POST' });
      const data = await response.json();
      alert(data.message || data.error);
      fetchReceipts();
    } catch (e) {
      console.error('Scan error', e);
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        const isPDF = file.type === 'application/pdf';
        const analyzeResponse = await fetch(
          isPDF ? '/api/receipts/analyze-pdf' : '/api/receipts/analyze',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(isPDF ? { pdf: base64 } : { image: base64, mimeType: file.type }),
          }
        );
        if (!analyzeResponse.ok) throw new Error('Failed to analyze');
        const data = await analyzeResponse.json();

        const response = await fetch('/api/receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, imageUrl: base64 }),
        });
        if (response.ok) fetchReceipts();
        setIsProcessing(false);
        setIsAdding(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('OCR Error', error);
      alert('Failed to process receipt. Please try again.');
      setIsProcessing(false);
    }
  };

  // ── OCR helpers ───────────────────────────────────────────────────────────
  const resetOcr = () => {
    setOcrPreview(null);
    setOcrLoading(false);
    setOcrStatus('idle');
    setOcrFields(null);
  };

  const handleOcrScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setOcrPreview(dataUrl);
      setOcrLoading(true);
      setOcrStatus('idle');
      setOcrFields(null);

      // Strip data:image/...;base64, prefix → raw base64
      const base64 = dataUrl.split(',')[1] ?? dataUrl;

      try {
        const resp = await fetch('/api/ocr-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        });
        const data = await resp.json();

        if (resp.ok && !data.error) {
          setOcrFields({
            vendor:         String(data.vendor        ?? ''),
            amount:         String(data.amount         ?? ''),
            currency:       String(data.currency       ?? 'TZS'),
            date:           String(data.date           ?? ''),
            category:       String(data.category      ?? 'Other'),
            payment_method: String(data.payment_method ?? ''),
            notes:          String(data.notes          ?? ''),
          });
          setOcrStatus('success');
        } else {
          setOcrStatus('error');
        }
      } catch {
        setOcrStatus('error');
      } finally {
        setOcrLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOcrSubmit = async () => {
    if (!ocrFields) return;
    setIsProcessing(true);
    try {
      const resp = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor:         ocrFields.vendor,
          amount:         parseFloat(ocrFields.amount) || 0,
          currency:       ocrFields.currency || 'TZS',
          date:           ocrFields.date,
          time:           '',
          category:       ocrFields.category || 'Other',
          account_type:   'Unknown',
          payment_method: ocrFields.payment_method || undefined,
          notes:          ocrFields.notes || undefined,
          status:         'logged',
        }),
      });
      if (resp.ok) {
        fetchReceipts();
        setIsAdding(false);
        resetOcr();
      }
    } catch (err) {
      console.error('OCR submit error', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const isIncomplete = (r: Receipt) =>
    !r.vendor || r.vendor === 'Unknown' ||
    r.amount === 0 ||
    r.account_type === 'Unknown' ||
    (r.category === 'Other' && !r.notes);

  const handleSaveEdit = async () => {
    if (!selectedReceipt) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/receipts/${selectedReceipt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (response.ok) {
        const updated = await response.json();
        setReceipts(prev => prev.map(r => r.id === selectedReceipt.id ? { ...r, ...updated } : r));
        setSelectedReceipt(prev => prev ? { ...prev, ...updated } : null);
        setIsEditing(false);
      } else {
        alert('Failed to save changes');
      }
    } catch (e) {
      console.error('Save error', e);
      alert('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteReceipt = async (id: string) => {
    if (confirm('Are you sure you want to delete this receipt?')) {
      try {
        const response = await fetch(`/api/receipts/${id}`, { method: 'DELETE' });
        if (response.ok) {
          setReceipts(prev => prev.filter(r => r.id !== id));
          setSelectedReceipt(null);
        }
      } catch (e) {
        console.error('Failed to delete receipt', e);
      }
    }
  };

  const filteredReceipts = useMemo(() => {
    return receipts
      .filter(r => {
        const matchesSearch = r.vendor.toLowerCase().includes(search.toLowerCase());
        const matchesCategory =
          filterCategory === 'All' ? true :
          filterCategory === 'Incomplete' ? isIncomplete(r) :
          r.category === filterCategory;
        let matchesDate = true;
        if (dateRange !== 'All') {
          const date = parseISO(r.date);
          const now = new Date();
          if (dateRange === 'This Month') {
            matchesDate = isWithinInterval(date, { start: startOfMonth(now), end: endOfMonth(now) });
          } else if (dateRange === 'Last Month') {
            const lastMonth = subMonths(now, 1);
            matchesDate = isWithinInterval(date, { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) });
          }
        }
        return matchesSearch && matchesCategory && matchesDate;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [receipts, search, filterCategory, dateRange]);

  useEffect(() => { setVisibleCount(8); }, [search, filterCategory, dateRange]);

  const totalSpent = useMemo(() => filteredReceipts.reduce((s, r) => s + r.amount, 0), [filteredReceipts]);

  const reportData = useMemo(() => {
    const now = new Date();
    let start: Date;
    if (reportPeriod === 'daily') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (reportPeriod === 'weekly') {
      start = new Date(now);
      start.setDate(now.getDate() - 7);
    } else {
      start = startOfMonth(now);
    }
    const filtered = receipts.filter(r => {
      try { return new Date(r.date) >= start; } catch { return false; }
    });
    const total = filtered.reduce((s, r) => s + r.amount, 0);
    const byCategory: Record<string, number> = {};
    filtered.forEach(r => { byCategory[r.category] = (byCategory[r.category] || 0) + r.amount; });
    return { total, count: filtered.length, byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]) };
  }, [receipts, reportPeriod]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredReceipts.forEach(r => { totals[r.category] = (totals[r.category] || 0) + r.amount; });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [filteredReceipts]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-accent animate-spin" />
      </div>
    );
  }

  if (!session) return <Login />;

  const user = session.user;
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const fullName = (user.user_metadata?.full_name ?? user.email ?? 'User') as string;

  const NAV_ITEMS: { key: Page; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: 'receipts',  label: 'Receipts',  icon: <Wallet className="w-4 h-4" /> },
    { key: 'shipments', label: 'Shipments', icon: <Package className="w-4 h-4" /> },
  ];

  const goToShipments = () => { setCurrentPage('shipments'); setSelectedShipmentId(null); };

  return (
    <div className="relative w-full max-w-[100vw] overflow-x-hidden min-h-screen bg-brand-bg text-white font-sans selection:bg-brand-accent selection:text-black">

      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-brand-border px-4 md:px-6 h-16 md:h-20 flex items-center justify-between w-full max-w-[100vw] overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 bg-brand-accent rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(0,255,102,0.3)]">
            <Layers className="text-black w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight leading-none uppercase">tradexparts</h1>
            <span className="text-[9px] font-mono text-brand-accent tracking-widest uppercase hidden md:block">v1.0.0 // AI-POWERED</span>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 p-1 bg-brand-bg rounded-xl border border-brand-border">
          {NAV_ITEMS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setCurrentPage(key); if (key === 'shipments') setSelectedShipmentId(null); }}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all ${
                currentPage === key
                  ? 'bg-brand-accent text-black font-bold'
                  : 'text-brand-text-muted hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-4">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-brand-border text-brand-text-muted hover:text-brand-accent hover:border-brand-accent/40 transition-all"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-brand-border/50 rounded-lg border border-brand-border">
            <div className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-pulse" />
            <span className="text-[10px] font-mono text-brand-text-muted uppercase tracking-tighter">Cloud Sync</span>
          </div>

          {driveConnected ? (
            <button
              onClick={handleScanDrive}
              disabled={isScanning}
              className="hidden md:flex bg-brand-card text-brand-accent border border-brand-accent/30 px-4 py-2.5 rounded-full text-[10px] font-mono font-bold items-center gap-2 hover:bg-brand-accent/10 transition-all disabled:opacity-50"
            >
              {isScanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
              SCAN DRIVE
            </button>
          ) : (
            <a
              href="/api/auth/google"
              className="hidden md:flex bg-brand-card text-brand-text-muted border border-brand-border px-4 py-2.5 rounded-full text-[10px] font-mono font-bold items-center gap-2 hover:text-white hover:border-brand-text-muted transition-all"
            >
              <Layers className="w-3 h-3" />
              CONNECT DRIVE
            </a>
          )}

          <button
            onClick={() => setIsAdding(true)}
            className="hidden md:flex bg-brand-accent text-black px-5 py-2.5 rounded-full text-sm font-bold items-center gap-2 hover:scale-105 transition-all active:scale-95 shadow-[0_0_30px_rgba(0,255,102,0.2)]"
          >
            <Plus className="w-4 h-4" />
            ADD RECEIPT
          </button>

          <div className="flex items-center gap-3 pl-3 border-l border-brand-border">
            {avatarUrl ? (
              <img src={avatarUrl} alt={fullName} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full border border-brand-border object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-card border border-brand-border flex items-center justify-center text-xs font-bold text-brand-accent uppercase">
                {fullName.charAt(0)}
              </div>
            )}
            <span className="hidden md:block text-[10px] font-mono text-brand-text-muted uppercase tracking-widest max-w-[100px] truncate">
              {fullName}
            </span>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="p-2 rounded-lg text-brand-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Pages */}
      {currentPage === 'dashboard' && (
        <DashboardPage
          receipts={receipts}
          userName={fullName}
          onNewShipment={() => { setCurrentPage('shipments'); setOpenShipmentModal(true); }}
          onAddReceipt={() => setIsAdding(true)}
          onGoToReceipts={() => setCurrentPage('receipts')}
          onGoToShipments={goToShipments}
          onSelectShipment={(id) => { setCurrentPage('shipments'); setSelectedShipmentId(id); }}
        />
      )}

      {currentPage === 'shipments' && (
        selectedShipmentId ? (
          <ShipmentDetailPage
            shipmentId={selectedShipmentId}
            onBack={() => setSelectedShipmentId(null)}
          />
        ) : (
          <ShipmentsPage
            forceOpenModal={openShipmentModal}
            onForceOpenModalHandled={() => setOpenShipmentModal(false)}
            onSelectShipment={setSelectedShipmentId}
          />
        )
      )}

      {currentPage === 'receipts' && (
        <main className="w-full max-w-4xl mx-auto px-6 pt-10 pb-28 md:pb-10 space-y-10 overflow-x-hidden box-border">
          {/* Bento Grid Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="md:col-span-2 glass rounded-3xl p-8 relative overflow-hidden receipt-gradient"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-brand-accent/10 rounded-lg">
                    <Wallet className="w-4 h-4 text-brand-accent" />
                  </div>
                  <span className="text-xs font-mono text-brand-text-muted uppercase tracking-widest">Total Expenditure</span>
                </div>
                <Activity className="w-4 h-4 text-brand-text-muted" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono text-brand-accent">TSh</span>
                <span className="text-7xl font-bold tracking-tighter tabular-nums">
                  {totalSpent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="mt-8 flex items-center gap-4 text-xs font-mono text-brand-text-muted">
                <div className="flex items-center gap-1">
                  <span className="text-brand-accent">●</span>
                  <span>{receipts.length} RECEIPTS STORED</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-brand-accent">●</span>
                  <span>{CATEGORIES.length} CATEGORIES</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-3xl p-8 flex flex-col justify-between"
            >
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-brand-accent/10 rounded-lg">
                  <PieChart className="w-4 h-4 text-brand-accent" />
                </div>
                <span className="text-xs font-mono text-brand-text-muted uppercase tracking-widest">Top Sectors</span>
              </div>
              <div className="space-y-4">
                {categoryTotals.slice(0, 3).map(([category, amount]) => (
                  <div key={category} className="group">
                    <div className="flex items-center justify-between text-[10px] font-mono text-brand-text-muted uppercase mb-1">
                      <span>{category}</span>
                      <span className="text-white">TSh {amount.toLocaleString()}</span>
                    </div>
                    <div className="h-1 bg-brand-border rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(amount / totalSpent) * 100}%` }}
                        className="h-full bg-brand-accent"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-6 border-t border-brand-border">
                <button className="w-full flex items-center justify-between text-[10px] font-mono text-brand-accent uppercase tracking-widest hover:gap-2 transition-all">
                  <span>View Full Analytics</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          </div>

          {/* Controls & List */}
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                <input
                  type="text"
                  placeholder="SEARCH ARCHIVE..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-brand-card border border-brand-border rounded-2xl focus:outline-none focus:border-brand-accent/50 focus:ring-4 focus:ring-brand-accent/5 transition-all font-mono text-xs uppercase tracking-widest"
                />
              </div>
              <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 no-scrollbar">
                {['All', ...CATEGORIES].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-5 py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all border flex-shrink-0 ${
                      filterCategory === cat
                        ? 'bg-brand-accent text-black border-brand-accent font-bold'
                        : 'bg-brand-card text-brand-text-muted border-brand-border hover:border-brand-text-muted'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                <button
                  onClick={() => setFilterCategory('Incomplete')}
                  className={`px-5 py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all border flex-shrink-0 ${
                    filterCategory === 'Incomplete'
                      ? 'bg-orange-500 text-black border-orange-500 font-bold'
                      : 'bg-brand-card text-orange-400 border-orange-500/30 hover:border-orange-400'
                  }`}
                >
                  Incomplete
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Spending Report */}
              <div className="glass rounded-2xl p-4 border border-brand-border">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-mono text-brand-text-muted uppercase tracking-[0.2em]">Spending Report</h2>
                  <div className="flex gap-1">
                    {(['daily', 'weekly', 'monthly'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setReportPeriod(p)}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-mono uppercase tracking-widest transition-all ${
                          reportPeriod === p
                            ? 'bg-brand-accent text-black font-bold'
                            : 'text-brand-text-muted border border-brand-border hover:border-brand-accent/50'
                        }`}
                      >{p}</button>
                    ))}
                  </div>
                </div>
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-mono text-brand-text-muted uppercase">Total Spent</div>
                    <div className="text-2xl font-bold font-mono tracking-tighter">
                      <span className="text-brand-accent text-xs mr-1">TSh</span>
                      {reportData.total.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-brand-text-muted uppercase">Transactions</div>
                    <div className="text-2xl font-bold font-mono">{reportData.count}</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {reportData.byCategory.slice(0, 5).map(([cat, amt]) => (
                    <div key={cat} className="flex items-center gap-2">
                      <div className="text-[9px] font-mono text-brand-text-muted uppercase w-20 truncate">{cat}</div>
                      <div className="flex-1 h-1.5 bg-brand-border rounded-full overflow-hidden">
                        <div className="h-full bg-brand-accent rounded-full" style={{ width: `${(amt / reportData.total) * 100}%` }} />
                      </div>
                      <div className="text-[9px] font-mono text-white w-16 text-right">TSh {amt.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transaction Log */}
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-brand-accent rounded-full" />
                  <h2 className="text-xs font-mono text-brand-text-muted uppercase tracking-[0.2em]">Transaction Log</h2>
                </div>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as 'All' | 'This Month' | 'Last Month')}
                  className="text-[10px] font-mono bg-transparent border-none focus:ring-0 text-brand-text-muted uppercase tracking-widest cursor-pointer hover:text-brand-accent transition-colors"
                >
                  <option value="All">All Time</option>
                  <option value="This Month">This Month</option>
                  <option value="Last Month">Last Month</option>
                </select>
              </div>

              <AnimatePresence mode="popLayout">
                {filteredReceipts.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 gap-3">
                      {filteredReceipts.slice(0, visibleCount).map((receipt) => (
                        <motion.div
                          key={receipt.id}
                          layout
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          onClick={() => {
                            setSelectedReceipt(receipt);
                            if (isIncomplete(receipt)) {
                              setEditForm({
                                vendor: receipt.vendor,
                                amount: receipt.amount,
                                currency: receipt.currency,
                                category: receipt.category,
                                account_type: receipt.account_type,
                                payment_method: receipt.payment_method ?? '',
                                notes: receipt.notes ?? '',
                              });
                              setIsEditing(true);
                            } else {
                              setIsEditing(false);
                            }
                          }}
                          className="glass p-2.5 rounded-xl flex items-center justify-between cursor-pointer hover:border-brand-accent/30 transition-all group relative overflow-hidden"
                        >
                          <div className="absolute top-0 left-0 w-1 h-full bg-brand-accent opacity-0 group-hover:opacity-100 transition-all" />
                          <div className="flex items-center gap-5">
                            <div className="w-8 h-8 bg-brand-bg rounded-lg flex items-center justify-center border border-brand-border group-hover:border-brand-accent/20 transition-all flex-shrink-0 text-xs font-bold text-brand-accent uppercase">
                              {receipt.vendor.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-xs tracking-tight group-hover:text-brand-accent transition-colors uppercase">{receipt.vendor}</div>
                              <div className="text-[10px] font-mono text-brand-text-muted flex items-center gap-2 mt-1">
                                <span>{receipt.date}</span>
                                {receipt.time && <><span className="text-brand-border">/</span><span>{receipt.time}</span></>}
                                <span className="text-brand-border">/</span>
                                <span className="uppercase">{receipt.category}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {isIncomplete(receipt) && (
                              <span className="px-2 py-0.5 rounded-lg text-[8px] font-mono font-bold uppercase border bg-orange-500/10 text-orange-400 border-orange-500/30 hidden sm:block flex-shrink-0">!</span>
                            )}
                            <span className={`px-2 py-0.5 rounded-lg text-[8px] font-mono font-bold uppercase border hidden sm:block ${
                              receipt.account_type === 'Business'
                                ? 'bg-brand-accent/10 text-brand-accent border-brand-accent/30'
                                : receipt.account_type === 'Personal'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                : 'bg-neutral-800/60 text-neutral-400 border-neutral-700'
                            }`}>
                              {receipt.account_type}
                            </span>
                            <div className="text-right">
                              <div className="text-sm font-bold font-mono tracking-tighter">
                                <span className="text-brand-accent text-xs mr-1">{receipt.currency || 'TSh'}</span>
                                {receipt.amount.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                              </div>
                            </div>
                            <div className="p-2 rounded-lg bg-brand-border/30 group-hover:bg-brand-accent group-hover:text-black transition-all">
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    {filteredReceipts.length > visibleCount && (
                      <button
                        onClick={() => setVisibleCount(v => v + 8)}
                        className="w-full mt-3 py-2.5 text-[10px] font-mono uppercase tracking-widest text-brand-text-muted border border-brand-border rounded-xl hover:border-brand-accent/50 hover:text-brand-accent transition-all"
                      >
                        Load More ({filteredReceipts.length - visibleCount} remaining)
                      </button>
                    )}
                  </>
                ) : (
                  <div className="py-20 text-center glass rounded-3xl border-dashed border-brand-border">
                    <div className="w-16 h-16 bg-brand-card rounded-2xl flex items-center justify-center mx-auto mb-4 border border-brand-border">
                      <Layers className="w-8 h-8 text-brand-border" />
                    </div>
                    <div className="text-xs font-mono text-brand-text-muted uppercase tracking-widest mb-4">No data found in archive</div>
                    <button
                      onClick={() => setIsAdding(true)}
                      className="text-brand-accent font-bold text-[10px] font-mono uppercase tracking-widest hover:gap-2 flex items-center justify-center gap-1 mx-auto transition-all"
                    >
                      <span>Initialize First Entry</span>
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </main>
      )}

      {/* Add Receipt Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isProcessing && !ocrLoading) { setIsAdding(false); resetOcr(); } }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative glass w-full max-w-md rounded-[2.5rem] p-8 md:p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-bold uppercase tracking-tighter">Capture Data</h2>
                  <p className="text-[10px] font-mono text-brand-accent uppercase tracking-widest mt-1">AI Receipt Extraction</p>
                </div>
                {!isProcessing && !ocrLoading && (
                  <button
                    onClick={() => { setIsAdding(false); resetOcr(); }}
                    className="p-3 hover:bg-brand-border rounded-2xl transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* ── Spinner: Gemini auto-save ── */}
              {isProcessing ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-6">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-brand-accent/20 rounded-full animate-spin border-t-brand-accent" />
                    <Activity className="absolute inset-0 m-auto w-8 h-8 text-brand-accent animate-pulse" />
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-xl uppercase tracking-tighter">Analyzing Receipt...</div>
                    <div className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest mt-2">Extracting metadata via AI</div>
                  </div>
                </div>

              /* ── Spinner: Anthropic OCR in progress ── */
              ) : ocrLoading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  {ocrPreview && (
                    <img src={ocrPreview} alt="Receipt preview" className="w-24 h-24 object-cover rounded-xl border border-brand-border mb-2 opacity-60" />
                  )}
                  <Loader2 className="w-8 h-8 text-brand-accent animate-spin" />
                  <div className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest">
                    Extracting receipt data...
                  </div>
                </div>

              /* ── OCR result: editable form ── */
              ) : ocrFields ? (
                <div className="space-y-4">
                  {/* Thumbnail + status */}
                  <div className="flex items-center gap-4">
                    {ocrPreview && (
                      <img src={ocrPreview} alt="Scanned receipt" className="w-16 h-16 object-cover rounded-xl border border-brand-border flex-shrink-0" />
                    )}
                    <div>
                      {ocrStatus === 'success' && (
                        <div className="flex items-center gap-1.5 text-brand-accent">
                          <Check className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Receipt scanned successfully</span>
                        </div>
                      )}
                      {ocrStatus === 'error' && (
                        <p className="text-[10px] font-mono text-red-400 uppercase tracking-widest">
                          Could not read receipt — please fill in manually
                        </p>
                      )}
                      <p className="text-[9px] font-mono text-brand-text-muted mt-1">Review and edit the fields below before saving.</p>
                    </div>
                  </div>

                  {/* Editable form fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Vendor</label>
                      <input
                        type="text"
                        value={ocrFields.vendor}
                        onChange={e => setOcrFields(f => f ? { ...f, vendor: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Amount</label>
                      <input
                        type="number"
                        value={ocrFields.amount}
                        onChange={e => setOcrFields(f => f ? { ...f, amount: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Currency</label>
                      <input
                        type="text"
                        value={ocrFields.currency}
                        onChange={e => setOcrFields(f => f ? { ...f, currency: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Date</label>
                      <input
                        type="date"
                        value={ocrFields.date}
                        onChange={e => setOcrFields(f => f ? { ...f, date: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Category</label>
                      <select
                        value={CATEGORIES.includes(ocrFields.category) ? ocrFields.category : 'Other'}
                        onChange={e => setOcrFields(f => f ? { ...f, category: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Payment Method</label>
                      <select
                        value={ocrFields.payment_method}
                        onChange={e => setOcrFields(f => f ? { ...f, payment_method: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all"
                      >
                        <option value="">— Unknown —</option>
                        <option value="Cash">Cash</option>
                        <option value="M-Pesa">M-Pesa</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Card">Card</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Notes</label>
                      <textarea
                        value={ocrFields.notes}
                        onChange={e => setOcrFields(f => f ? { ...f, notes: e.target.value } : f)}
                        rows={2}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all resize-none"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={resetOcr}
                      className="flex-1 py-3 rounded-2xl border border-brand-border text-brand-text-muted font-mono text-[10px] uppercase tracking-widest hover:border-brand-text-muted hover:text-white transition-all"
                    >
                      Re-scan
                    </button>
                    <button
                      onClick={handleOcrSubmit}
                      className="flex-1 py-3 rounded-2xl bg-brand-accent text-black font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Save Receipt
                    </button>
                  </div>
                </div>

              /* ── Default view ── */
              ) : (
                <div className="space-y-6">

                  {/* ─ NEW: Anthropic OCR scan ─ */}
                  <div>
                    <label className="flex items-center justify-center gap-3 w-full py-4 border-2 border-brand-accent/40 rounded-2xl cursor-pointer hover:bg-brand-accent/5 hover:border-brand-accent transition-all group">
                      <div className="w-9 h-9 bg-brand-accent/10 rounded-xl flex items-center justify-center group-hover:bg-brand-accent/20 transition-all flex-shrink-0">
                        <Camera className="w-5 h-5 text-brand-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-tight text-brand-accent">Scan Receipt</p>
                        <p className="text-[9px] font-mono text-brand-text-muted uppercase tracking-widest">Claude AI extracts fields for review</p>
                      </div>
                      <input type="file" className="hidden" accept="image/*" capture="environment" onChange={handleOcrScan} />
                    </label>
                    {ocrStatus === 'error' && (
                      <p className="mt-2 text-center text-[9px] font-mono text-red-400 uppercase tracking-widest">
                        Could not read receipt — please fill in manually
                      </p>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-brand-border" />
                    </div>
                    <div className="relative flex justify-center text-[10px] font-mono">
                      <span className="px-4 bg-brand-card text-brand-text-muted uppercase tracking-widest">or</span>
                    </div>
                  </div>

                  {/* ─ Existing: Gemini auto-save ─ */}
                  <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-brand-border rounded-[2rem] cursor-pointer hover:border-brand-accent hover:bg-brand-accent/5 transition-all group">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <div className="w-14 h-14 bg-brand-card rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-all border border-brand-border group-hover:border-brand-accent">
                        <Activity className="w-7 h-7 text-brand-accent" />
                      </div>
                      <p className="text-sm font-bold uppercase tracking-tighter text-center">Auto-Import via Gemini</p>
                      <p className="text-[9px] font-mono text-brand-text-muted uppercase tracking-widest mt-1 text-center">Saves directly — no review step</p>
                    </div>
                    <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleAddReceipt} />
                  </label>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-brand-border" />
                    </div>
                    <div className="relative flex justify-center text-[10px] font-mono">
                      <span className="px-4 bg-brand-card text-brand-text-muted uppercase tracking-widest">Manual Override</span>
                    </div>
                  </div>

                  <button
                    onClick={() => alert('Manual entry coming soon! Use Scan or Auto-Import for now.')}
                    className="w-full py-4 rounded-2xl border border-brand-border font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-brand-border transition-all"
                  >
                    Enter Data Manually
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setSelectedReceipt(null); setIsEditing(false); }}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              className="relative glass w-full max-w-lg rounded-[3rem] overflow-y-auto max-h-[90vh] shadow-[0_0_100px_rgba(0,0,0,0.5)]"
            >
              <div className="p-8 md:p-10">
                {isIncomplete(selectedReceipt) && (
                  <div className="mb-6 p-4 rounded-2xl bg-orange-500/10 border border-orange-500/30">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-sm">⚠️</span>
                      <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-orange-400">
                        This receipt needs more information
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        (!selectedReceipt.vendor || selectedReceipt.vendor === 'Unknown') && 'Vendor',
                        selectedReceipt.amount === 0 && 'Amount',
                        selectedReceipt.account_type === 'Unknown' && 'Account Type',
                        (selectedReceipt.category === 'Other' && !selectedReceipt.notes) && 'Category / Notes',
                        selectedReceipt.status === 'pending' && 'Pending Status',
                      ] as (string | false)[]).filter(Boolean).map(field => (
                        <span key={field as string} className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase bg-orange-500/20 text-orange-300 border border-orange-500/40">
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex flex-wrap gap-2">
                    {isEditing ? (
                      <span className="px-3 py-1 bg-orange-500/10 rounded-lg border border-orange-500/30 text-[10px] font-mono text-orange-400 uppercase tracking-widest">Editing</span>
                    ) : (
                      <>
                        <span className="px-3 py-1 bg-brand-accent/10 rounded-lg border border-brand-accent/20 text-[10px] font-mono text-brand-accent uppercase tracking-widest">{selectedReceipt.category}</span>
                        <span className={`px-3 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase ${
                          selectedReceipt.account_type === 'Business' ? 'bg-brand-accent/10 text-brand-accent border-brand-accent/30'
                          : selectedReceipt.account_type === 'Personal' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : 'bg-neutral-800/60 text-neutral-400 border-neutral-700'
                        }`}>{selectedReceipt.account_type}</span>
                        {selectedReceipt.status === 'pending' && (
                          <span className="px-3 py-1 bg-amber-500/10 rounded-lg border border-amber-500/30 text-[10px] font-mono text-amber-400 uppercase tracking-widest">Pending</span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    {!isEditing && (
                      <button
                        onClick={() => {
                          setEditForm({
                            vendor: selectedReceipt.vendor,
                            amount: selectedReceipt.amount,
                            currency: selectedReceipt.currency,
                            category: selectedReceipt.category,
                            account_type: selectedReceipt.account_type,
                            payment_method: selectedReceipt.payment_method ?? '',
                            notes: selectedReceipt.notes ?? '',
                          });
                          setIsEditing(true);
                        }}
                        className="p-2.5 bg-brand-card rounded-2xl hover:bg-brand-accent/10 hover:text-brand-accent transition-all border border-brand-border text-brand-text-muted"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedReceipt(null); setIsEditing(false); }}
                      className="p-2.5 bg-brand-card rounded-2xl hover:bg-brand-border transition-all border border-brand-border"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Vendor</label>
                        <input type="text" value={editForm.vendor ?? ''} onChange={e => setEditForm(f => ({ ...f, vendor: e.target.value }))}
                          className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all" />
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Amount</label>
                        <input type="number" value={editForm.amount ?? 0} onChange={e => setEditForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all" />
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Currency</label>
                        <input type="text" value={editForm.currency ?? 'TSh'} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}
                          className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all" />
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Category</label>
                        <select value={editForm.category ?? 'Other'} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                          className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all">
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Account Type</label>
                        <select value={editForm.account_type ?? 'Unknown'} onChange={e => setEditForm(f => ({ ...f, account_type: e.target.value as Receipt['account_type'] }))}
                          className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all">
                          <option value="Business">Business</option>
                          <option value="Personal">Personal</option>
                          <option value="Unknown">Unknown</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Payment Method</label>
                        <select value={editForm.payment_method ?? ''} onChange={e => setEditForm(f => ({ ...f, payment_method: e.target.value }))}
                          className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all">
                          <option value="">— None —</option>
                          <option value="Cash">Cash</option>
                          <option value="M-Pesa">M-Pesa</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Card">Card</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Notes</label>
                        <textarea value={editForm.notes ?? ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                          className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all resize-none" />
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setIsEditing(false)}
                        className="flex-1 py-3 rounded-2xl border border-brand-border text-brand-text-muted font-mono text-[10px] uppercase tracking-widest hover:border-brand-text-muted hover:text-white transition-all">
                        Cancel
                      </button>
                      <button onClick={handleSaveEdit} disabled={isSaving}
                        className="flex-1 py-3 rounded-2xl bg-brand-accent text-black font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="text-3xl font-bold uppercase tracking-tighter leading-none mb-1">{selectedReceipt.vendor}</h2>
                    <div className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest mb-8">
                      {selectedReceipt.date}{selectedReceipt.time ? ` · ${selectedReceipt.time}` : ''}
                    </div>
                    <div className="flex items-baseline gap-2 mb-8">
                      <span className="text-xl font-mono text-brand-accent">{selectedReceipt.currency || 'TSh'}</span>
                      <span className="text-5xl font-bold tracking-tighter tabular-nums">{selectedReceipt.amount.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="bg-brand-bg rounded-xl px-4 py-3 border border-brand-border">
                        <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1">Receipt ID</div>
                        <div className="text-xs font-mono text-white truncate">{selectedReceipt.id}</div>
                      </div>
                      <div className="bg-brand-bg rounded-xl px-4 py-3 border border-brand-border">
                        <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1">Status</div>
                        <div className={`text-xs font-mono font-bold uppercase ${selectedReceipt.status === 'pending' ? 'text-amber-400' : 'text-brand-accent'}`}>{selectedReceipt.status}</div>
                      </div>
                      {selectedReceipt.payment_method && (
                        <div className="bg-brand-bg rounded-xl px-4 py-3 border border-brand-border">
                          <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1">Payment Method</div>
                          <div className="text-xs font-mono text-white">{selectedReceipt.payment_method}</div>
                        </div>
                      )}
                      {selectedReceipt.submitted_by && (
                        <div className="bg-brand-bg rounded-xl px-4 py-3 border border-brand-border">
                          <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1">Submitted By</div>
                          <div className="text-xs font-mono text-white">{selectedReceipt.submitted_by}</div>
                        </div>
                      )}
                    </div>
                    {selectedReceipt.notes && (
                      <div className="mb-8">
                        <div className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest mb-2">Notes</div>
                        <p className="text-sm text-brand-text-muted leading-relaxed italic">"{selectedReceipt.notes}"</p>
                      </div>
                    )}
                    <button onClick={() => deleteReceipt(selectedReceipt.id)}
                      className="w-full py-4 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 font-mono text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      Purge Transaction
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-brand-border">
        <div className="flex items-center justify-around px-4 pb-5 pt-2">
          <button
            onClick={() => setCurrentPage('dashboard')}
            className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all ${currentPage === 'dashboard' ? 'text-brand-accent' : 'text-brand-text-muted'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[7px] font-mono uppercase tracking-widest">Home</span>
          </button>

          <button
            onClick={() => setCurrentPage('receipts')}
            className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all ${currentPage === 'receipts' ? 'text-brand-accent' : 'text-brand-text-muted'}`}
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[7px] font-mono uppercase tracking-widest">Receipts</span>
          </button>

          <button
            onClick={() => {
              if (currentPage === 'receipts') setIsAdding(true);
              else if (currentPage === 'shipments') setOpenShipmentModal(true);
              else setIsAdding(true);
            }}
            className="w-14 h-14 bg-brand-accent text-black rounded-2xl flex items-center justify-center -mt-7 shadow-[0_0_30px_rgba(0,255,102,0.35)] active:scale-95 transition-all"
          >
            <Plus className="w-6 h-6" />
          </button>

          <button
            onClick={() => { setCurrentPage('shipments'); setSelectedShipmentId(null); }}
            className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all ${currentPage === 'shipments' ? 'text-brand-accent' : 'text-brand-text-muted'}`}
          >
            <Package className="w-5 h-5" />
            <span className="text-[7px] font-mono uppercase tracking-widest">Shipments</span>
          </button>

          <button
            onClick={toggleTheme}
            className="flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all text-brand-text-muted"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="text-[7px] font-mono uppercase tracking-widest">Theme</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
