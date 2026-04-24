/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, PieChart, Trash2, Camera, Loader2, X, ChevronRight, TrendingUp, Calendar, ArrowUpRight, Activity, Layers, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { Receipt, CATEGORIES } from './types';
import { extractReceiptData } from './services/geminiService';

export default function App() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | 'All'>('All');
  const [dateRange, setDateRange] = useState<'All' | 'This Month' | 'Last Month'>('All');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [driveConnected, setDriveConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Fetch from backend API
  const fetchReceipts = async (retries = 3) => {
    try {
      const response = await fetch('/api/receipts');
      const contentType = response.headers.get("content-type");
      
      if (response.ok && contentType && contentType.includes("application/json")) {
        const data = await response.json();
        setReceipts(data);
      } else if (response.status === 200 && contentType && contentType.includes("text/html")) {
        // Server is still warming up (AI Studio placeholder page)
        if (retries > 0) {
          setTimeout(() => fetchReceipts(retries - 1), 2000);
        }
      } else {
        const text = await response.text();
        console.error(`Failed to fetch receipts: ${response.status} ${response.statusText}`, text);
      }
    } catch (e) {
      if (retries > 0) {
        setTimeout(() => fetchReceipts(retries - 1), 2000);
      } else {
        console.error("Failed to fetch receipts after retries", e);
      }
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
      console.error("Failed to check drive status", e);
    }
  };

  useEffect(() => {
    // Initial delay to allow server to warm up
    const timeout = setTimeout(() => {
      fetchReceipts();
      checkDriveStatus();
    }, 1000);

    // Poll for updates every 10 seconds
    const interval = setInterval(() => fetchReceipts(0), 10000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const handleScanDrive = async () => {
    setIsScanning(true);
    try {
      const response = await fetch('/api/drive/scan', { method: 'POST' });
      const data = await response.json();
      alert(data.message || data.error);
      fetchReceipts();
    } catch (e) {
      console.error("Scan error", e);
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
        const data = await extractReceiptData(base64, file.type);
        
        const response = await fetch('/api/receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, imageUrl: base64 })
        });

        if (response.ok) {
          fetchReceipts();
        }
        
        setIsProcessing(false);
        setIsAdding(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("OCR Error", error);
      alert("Failed to process receipt. Please try again.");
      setIsProcessing(false);
    }
  };

  const deleteReceipt = async (id: string) => {
    if (confirm("Are you sure you want to delete this receipt?")) {
      try {
        const response = await fetch(`/api/receipts/${id}`, { method: 'DELETE' });
        if (response.ok) {
          setReceipts(prev => prev.filter(r => r.id !== id));
          setSelectedReceipt(null);
        }
      } catch (e) {
        console.error("Failed to delete receipt", e);
      }
    }
  };

  const filteredReceipts = useMemo(() => {
    return receipts.filter(r => {
      const matchesSearch = r.storeName.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = filterCategory === 'All' || r.category === filterCategory;
      
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
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [receipts, search, filterCategory, dateRange]);

  const totalSpent = useMemo(() => {
    return filteredReceipts.reduce((sum, r) => sum + r.amount, 0);
  }, [filteredReceipts]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredReceipts.forEach(r => {
      totals[r.category] = (totals[r.category] || 0) + r.amount;
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [filteredReceipts]);

  return (
    <div className="min-h-screen bg-brand-bg text-white font-sans selection:bg-brand-accent selection:text-black">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-brand-border px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-accent rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(0,255,102,0.3)]">
            <Layers className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">RECEIPT</h1>
            <span className="text-[10px] font-mono text-brand-accent tracking-widest uppercase">v1.0.0 // AI-POWERED</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-brand-border/50 rounded-lg border border-brand-border">
            <div className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-pulse" />
            <span className="text-[10px] font-mono text-brand-text-muted uppercase tracking-tighter">Cloud Sync Active</span>
          </div>
          
          {driveConnected ? (
            <button 
              onClick={handleScanDrive}
              disabled={isScanning}
              className="bg-brand-card text-brand-accent border border-brand-accent/30 px-4 py-2.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-2 hover:bg-brand-accent/10 transition-all disabled:opacity-50"
            >
              {isScanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
              SCAN DRIVE
            </button>
          ) : (
            <a 
              href="/api/auth/google"
              className="bg-brand-card text-brand-text-muted border border-brand-border px-4 py-2.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-2 hover:text-white hover:border-brand-text-muted transition-all"
            >
              <Layers className="w-3 h-3" />
              CONNECT DRIVE
            </a>
          )}

          <button 
            onClick={() => setIsAdding(true)}
            className="bg-brand-accent text-black px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 hover:scale-105 transition-all active:scale-95 shadow-[0_0_30px_rgba(0,255,102,0.2)]"
          >
            <Plus className="w-4 h-4" />
            ADD RECEIPT
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* Bento Grid Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Spent Card */}
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

          {/* Top Category Card */}
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
                  className={`px-5 py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all border ${
                    filterCategory === cat 
                    ? 'bg-brand-accent text-black border-brand-accent font-bold' 
                    : 'bg-brand-card text-brand-text-muted border-brand-border hover:border-brand-text-muted'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-brand-accent rounded-full" />
                <h2 className="text-xs font-mono text-brand-text-muted uppercase tracking-[0.2em]">Transaction Log</h2>
              </div>
              <select 
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
                className="text-[10px] font-mono bg-transparent border-none focus:ring-0 text-brand-text-muted uppercase tracking-widest cursor-pointer hover:text-brand-accent transition-colors"
              >
                <option value="All">All Time</option>
                <option value="This Month">This Month</option>
                <option value="Last Month">Last Month</option>
              </select>
            </div>

            <AnimatePresence mode="popLayout">
              {filteredReceipts.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {filteredReceipts.map((receipt) => (
                    <motion.div
                      key={receipt.id}
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      onClick={() => setSelectedReceipt(receipt)}
                      className="glass p-5 rounded-2xl flex items-center justify-between cursor-pointer hover:border-brand-accent/30 transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-brand-accent opacity-0 group-hover:opacity-100 transition-all" />
                      
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-brand-bg rounded-xl overflow-hidden flex items-center justify-center border border-brand-border group-hover:border-brand-accent/20 transition-all">
                          {receipt.imageUrl ? (
                            <img src={receipt.imageUrl} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all" referrerPolicy="no-referrer" />
                          ) : (
                            <Camera className="w-5 h-5 text-brand-text-muted" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-sm tracking-tight group-hover:text-brand-accent transition-colors uppercase">{receipt.storeName}</div>
                          <div className="text-[10px] font-mono text-brand-text-muted flex items-center gap-2 mt-1">
                            <span>{format(parseISO(receipt.date), 'dd.MM.yyyy')}</span>
                            <span className="text-brand-border">/</span>
                            <span className="uppercase">{receipt.category}</span>
                            {receipt.source && (
                              <>
                                <span className="text-brand-border">/</span>
                                <span className="px-1.5 py-0.5 rounded-full bg-brand-accent/10 text-brand-accent text-[8px] font-bold border border-brand-accent/20">
                                  {receipt.source}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-lg font-bold font-mono tracking-tighter">
                            <span className="text-brand-accent text-xs mr-1">TSh</span>
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

      {/* Add Receipt Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isProcessing && setIsAdding(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative glass w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h2 className="text-2xl font-bold uppercase tracking-tighter">Capture Data</h2>
                  <p className="text-[10px] font-mono text-brand-accent uppercase tracking-widest mt-1">Neural OCR Processing</p>
                </div>
                {!isProcessing && (
                  <button onClick={() => setIsAdding(false)} className="p-3 hover:bg-brand-border rounded-2xl transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {isProcessing ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-6">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-brand-accent/20 rounded-full animate-spin border-t-brand-accent" />
                    <Activity className="absolute inset-0 m-auto w-8 h-8 text-brand-accent animate-pulse" />
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-xl uppercase tracking-tighter">Analyzing Receipt...</div>
                    <div className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest mt-2">Extracting metadata via Gemini AI</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-brand-border rounded-[2rem] cursor-pointer hover:border-brand-accent hover:bg-brand-accent/5 transition-all group relative overflow-hidden">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <div className="w-16 h-16 bg-brand-card rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-all border border-brand-border group-hover:border-brand-accent">
                        <Camera className="w-8 h-8 text-brand-accent" />
                      </div>
                      <p className="text-sm font-bold uppercase tracking-tighter">Upload Transaction Image</p>
                      <p className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest mt-2">PNG, JPG // MAX 10MB</p>
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={handleAddReceipt} />
                  </label>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-brand-border"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] font-mono">
                      <span className="px-4 bg-brand-card text-brand-text-muted uppercase tracking-widest">Manual Override</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => alert("Manual entry coming soon! Use AI capture for now.")}
                    className="w-full py-5 rounded-2xl border border-brand-border font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-brand-border transition-all"
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
              onClick={() => setSelectedReceipt(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative glass w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)]"
            >
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="h-80 md:h-auto bg-black relative border-b md:border-b-0 md:border-r border-brand-border">
                  {selectedReceipt.imageUrl ? (
                    <img src={selectedReceipt.imageUrl} alt="" className="w-full h-full object-contain opacity-90" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Camera className="w-16 h-16 text-brand-border" />
                    </div>
                  )}
                  <button 
                    onClick={() => setSelectedReceipt(null)}
                    className="absolute top-6 left-6 p-3 bg-black/50 backdrop-blur-md rounded-2xl hover:bg-black transition-all border border-white/10"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-10 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="px-3 py-1 bg-brand-accent/10 rounded-lg border border-brand-accent/20">
                        <span className="text-[10px] font-mono text-brand-accent uppercase tracking-widest">{selectedReceipt.category}</span>
                      </div>
                      <span className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest">{format(parseISO(selectedReceipt.date), 'dd.MM.yyyy')}</span>
                    </div>
                    
                    <h2 className="text-4xl font-bold uppercase tracking-tighter mb-8 leading-none">{selectedReceipt.storeName}</h2>
                    
                    <div className="space-y-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-mono text-brand-accent">TSh</span>
                        <span className="text-6xl font-bold tracking-tighter tabular-nums">
                          {selectedReceipt.amount.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                        </span>
                      </div>
                      
                      <div className="p-6 bg-brand-bg rounded-2xl border border-brand-border">
                        <div className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest mb-3">System Metadata</div>
                        <div className="space-y-2 text-xs font-mono">
                          <div className="flex justify-between">
                            <span className="text-brand-text-muted">ID:</span>
                            <span className="text-white truncate ml-4">{selectedReceipt.id.slice(0, 12)}...</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-brand-text-muted">TIMESTAMP:</span>
                            <span className="text-white">{format(parseISO(selectedReceipt.createdAt), 'HH:mm:ss')}</span>
                          </div>
                        </div>
                      </div>

                      {selectedReceipt.notes && (
                        <div>
                          <div className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest mb-2">Notes</div>
                          <p className="text-sm text-brand-text-muted leading-relaxed italic">"{selectedReceipt.notes}"</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-10">
                    <button 
                      onClick={() => deleteReceipt(selectedReceipt.id)}
                      className="w-full py-4 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 font-mono text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Purge Transaction
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
