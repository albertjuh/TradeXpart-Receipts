import React, { useState, useEffect, useMemo, useRef } from 'react';
import jsQR from 'jsqr';
import type { Session } from '@supabase/supabase-js';
import {
  Plus, Search, PieChart, Trash2, Camera, Loader2, X,
  ChevronRight, ArrowUpRight,
  Activity, Layers, Wallet, Package, Pencil, Check,
  Sun, Moon, LayoutDashboard, Download, Tag, TrendingUp, LogOut, Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { Receipt, CATEGORIES } from './types';
import { toTZS, isForeignCurrency } from './currency';
import { supabase } from './supabase';
import Login from './Login';
import ShipmentsPage from './ShipmentsPage';
import ShipmentDetailPage from './ShipmentDetailPage';
import DashboardPage from './DashboardPage';
import SalesPage, { type Sale } from './SalesPage';
import ClientsPage from './ClientsPage';
import ExportModal from './components/ExportModal';

type Page = 'dashboard' | 'receipts' | 'shipments' | 'sales' | 'clients';

type ParsedItem = {
  vendor: string;
  amount: number;
  currency: string;
  date: string | null;
  category: string;
  payment_method: string | null;
  notes: string | null;
  account_type?: string;
};

type ChatPhase = 'account_type' | 'category' | 'shipment' | 'confirm';
type ChatMessage = { role: 'ai' | 'user'; text: string };
type ModalShipment = { id: string; commodity: string; reference_number: string; type: string };
type BulkResult = {
  vendor: string; amount: number; currency: string; date: string | null;
  category: string; payment_method: string | null; notes: string | null;
  error?: boolean;
  duplicate?: boolean;
};

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
  const [profile, setProfile] = useState<{ full_name: string | null; role: 'admin' | 'accountant' } | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [openSaleModal, setOpenSaleModal] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | 'All'>('All');
  const [dateRange, setDateRange] = useState<'All' | 'This Month' | 'Last Month'>('All');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [openShipmentModal, setOpenShipmentModal] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Receipt>>({});
  const [isSaving, setIsSaving] = useState(false);

  // OCR scan state (Anthropic)
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [ocrFields, setOcrFields] = useState<Record<string, string> | null>(null);

  // Modal tab + text-parse state
  const [modalTab, setModalTab] = useState<'scan' | 'type' | 'bulk'>('scan');
  const [typeText, setTypeText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [isSavingAll, setIsSavingAll] = useState(false);

  // Chat step state
  const [chatActive, setChatActive] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatExtracted, setChatExtracted] = useState<Record<string, string> | null>(null);
  const [chatPhase, setChatPhase] = useState<ChatPhase>('account_type');
  const [modalShipments, setModalShipments] = useState<ModalShipment[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // QR + bulk upload state
  const [qrMsg, setQrMsg] = useState<string | null>(null);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [bulkDragging, setBulkDragging] = useState(false);
  const [bulkEditIndex, setBulkEditIndex] = useState<number | null>(null);
  const [dupWarning, setDupWarning] = useState<{ vendor: string; amount: number; date: string | null } | null>(null);
  const dupPendingRef = useRef<(() => Promise<void>) | null>(null);

  // Custom categories (persisted to localStorage)
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('custom_categories') ?? '[]'); }
    catch { return []; }
  });
  const [newCatInput, setNewCatInput] = useState('');
  const [showNewCatInFilter, setShowNewCatInFilter] = useState(false);

  // Quick category picker state
  const [quickCategoryId, setQuickCategoryId] = useState<string | null>(null);
  const [quickCategoryPos, setQuickCategoryPos] = useState<{ top: number; left: number } | null>(null);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraCountdown, setCameraCountdown] = useState<number | null>(null);
  const [cameraFlash, setCameraFlash] = useState(false);
  const [scanDragging, setScanDragging] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReceipts = async () => {
    try {
      console.log('Fetching receipts...');
      setReceiptsError(null);
      const { data, error } = await supabase.from('receipts').select('*').order('created_at', { ascending: false });
      console.log('Receipts result:', data, error);
      if (error) throw error;
      setReceipts((data ?? []).map((row) => ({
        id: row.id ?? '',
        date: row.date ?? '',
        time: row.time ?? '',
        vendor: row.vendor ?? '',
        amount: typeof row.amount === 'number' ? row.amount : (parseFloat(row.amount) || 0),
        currency: row.currency ?? 'TSh',
        category: row.category ?? 'Other',
        account_type: (row.account_type ?? 'Unknown') as Receipt['account_type'],
        payment_method: row.payment_method ?? undefined,
        submitted_by: row.submitted_by ?? undefined,
        status: (row.status ?? 'logged') as Receipt['status'],
        notes: row.notes ?? undefined,
      })));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('fetchReceipts FAILED:', msg);
      setReceiptsError(msg);
    }
  };

  const testConnection = async () => {
    try {
      const { error } = await supabase.from('receipts').select('count').limit(1);
      if (error) console.error('Supabase connection test FAILED:', error.message, error.code);
      else console.log('Supabase connection test PASSED');
    } catch (e: unknown) {
      console.error('Supabase connection test ERROR:', e instanceof Error ? e.message : e);
    }
  };

  const fetchSales = async () => {
    try {
      setSalesError(null);
      const { data, error } = await supabase.from('sales').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setSales((data ?? []) as Sale[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('fetchSales FAILED:', msg);
      setSalesError(msg);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user.id) { setProfile(null); return; }
    supabase.from('profiles').select('full_name, role').eq('user_id', session.user.id).single()
      .then(({ data }) => setProfile(data as { full_name: string | null; role: 'admin' | 'accountant' } | null));
  }, [session?.user.id]);

  useEffect(() => {
    testConnection();
    fetchReceipts();
    fetchSales();
  }, []);

  const handleAddReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const isPDF = file.type === 'application/pdf';
      const analyzeResponse = await fetch(
        isPDF ? '/api/receipts/analyze-pdf' : '/api/receipts/analyze',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isPDF ? { pdf: dataUrl } : { image: dataUrl, mimeType: file.type }),
        }
      );
      if (!analyzeResponse.ok) throw new Error('Failed to analyze');
      const data = await analyzeResponse.json();
      const { error: insertError } = await supabase.from('receipts').insert({
        vendor: data.vendor ?? '', amount: typeof data.amount === 'number' ? data.amount : (parseFloat(data.amount) || 0),
        currency: data.currency ?? 'TZS', date: data.date ?? new Date().toISOString().split('T')[0],
        time: data.time ?? '', category: data.category ?? 'Other', account_type: 'Unknown',
        payment_method: data.payment_method ?? null, notes: data.notes ?? null,
        status: 'logged', user_id: null, submitted_by: fullName,
      });
      if (!insertError) { await fetchReceipts(); setIsAdding(false); }
    } catch (error) {
      console.error('OCR Error', error);
      alert('Failed to process receipt. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── OCR helpers ───────────────────────────────────────────────────────────
  const resetOcr = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (detectionIntervalRef.current) { clearInterval(detectionIntervalRef.current); detectionIntervalRef.current = null; }
    if (countdownTimeoutRef.current) { clearTimeout(countdownTimeoutRef.current); countdownTimeoutRef.current = null; }
    setCameraActive(false); setCameraCountdown(null); setCameraFlash(false); setScanDragging(false);
    setOcrPreview(null);
    setOcrLoading(false);
    setOcrStatus('idle');
    setOcrFields(null);
    setTypeText('');
    setParsedItems([]);
    setSelectedItems(new Set());
    setModalTab('scan');
    setChatActive(false);
    setChatMessages([]);
    setChatExtracted(null);
    setChatPhase('account_type');
    setQrMsg(null);
    setBulkFiles([]);
    setBulkResults([]);
    setBulkSelected(new Set());
    setBulkProgress(null);
    setBulkProcessing(false);
    setBulkSaving(false);
    setBulkSuccess(null);
    setBulkDragging(false);
    setBulkEditIndex(null);
    setDupWarning(null);
    dupPendingRef.current = null;
  };

  const getChatAiMessage = (phase: ChatPhase, data: Record<string, string>): string => {
    if (phase === 'account_type') return 'Is this a Business or Personal expense?';
    if (phase === 'category') return 'What category fits best?';
    if (phase === 'shipment') {
      const amt = parseFloat(data.amount) || 0;
      return `This is a large expense (${data.currency || 'TZS'} ${amt.toLocaleString()}) — would you like to link it to one of your shipments?`;
    }
    return 'All set! Ready to save this receipt?';
  };

  const getNextChatPhase = (current: ChatPhase, data: Record<string, string>): ChatPhase => {
    if (current === 'account_type') {
      if (!data.category || data.category === 'Other') return 'category';
      if ((parseFloat(data.amount) || 0) > 50000) return 'shipment';
      return 'confirm';
    }
    if (current === 'category') {
      if ((parseFloat(data.amount) || 0) > 50000) return 'shipment';
      return 'confirm';
    }
    return 'confirm';
  };

  const initChat = (data: Record<string, string>) => {
    const detected = data.account_type;
    const autoDetected = detected === 'Business' || detected === 'Personal';
    setChatExtracted(data);
    if (autoDetected) {
      const nextPhase = getNextChatPhase('account_type', data);
      setChatPhase(nextPhase);
      const nextMsg = getChatAiMessage(nextPhase, data);
      setChatMessages([{ role: 'ai', text: `Auto-detected: ${detected} expense. ${nextMsg}` }]);
    } else {
      setChatPhase('account_type');
      setChatMessages([{ role: 'ai', text: 'Is this a Business or Personal expense?' }]);
    }
    setChatActive(true);
  };

  const handleChatAnswer = (answer: string) => {
    setChatMessages(prev => [...prev, { role: 'user', text: answer }]);
    const patch: Record<string, string> =
      chatPhase === 'account_type' ? { account_type: answer } :
      chatPhase === 'category'     ? { category: answer }     :
      chatPhase === 'shipment'     ? { shipment_link: answer } : {};
    const updatedData = { ...(chatExtracted ?? {}), ...patch };
    setChatExtracted(updatedData);
    const next = getNextChatPhase(chatPhase, updatedData);
    setChatPhase(next);
    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: 'ai', text: getChatAiMessage(next, updatedData) }]);
    }, 350);
  };

  const goToForm = () => {
    const d = chatExtracted ?? {};
    setOcrFields({
      vendor:         d.vendor         ?? '',
      amount:         d.amount         ?? '',
      currency:       d.currency       ?? 'TZS',
      date:           d.date           ?? '',
      category:       d.category       ?? 'Other',
      payment_method: d.payment_method ?? '',
      notes:          d.notes          ?? '',
      account_type:   d.account_type   ?? 'Business',
    });
    setChatActive(false);
    setChatMessages([]);
    setChatExtracted(null);
  };

  const detectQR = (dataUrl: string): Promise<string | null> =>
    new Promise(resolve => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        resolve(code ? code.data : null);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(((ev.target?.result as string) ?? '').split(',')[1] ?? '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const processOcrFile = async (file: File) => {
    const isPDF = file.type === 'application/pdf';
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setOcrPreview(isPDF ? null : dataUrl);
      setOcrLoading(true);
      setOcrStatus('idle');
      setOcrFields(null);
      setQrMsg(null);

      const base64 = dataUrl.split(',')[1] ?? dataUrl;

      try {
        if (!isPDF) {
          const qrData = await detectQR(dataUrl);
          if (qrData) {
            setQrMsg('QR code detected — extracting data...');
            const resp = await fetch('/api/parse-receipt-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: qrData }),
            });
            const data = await resp.json();
            const items: ParsedItem[] = Array.isArray(data) ? data : [];
            if (resp.ok && items.length >= 1) {
              initChat({
                vendor:         String(items[0].vendor         ?? ''),
                amount:         String(items[0].amount          ?? ''),
                currency:       String(items[0].currency        ?? 'TZS'),
                date:           String(items[0].date            ?? ''),
                category:       String(items[0].category        ?? 'Other'),
                payment_method: String(items[0].payment_method  ?? ''),
                notes:          String(items[0].notes           ?? ''),
                account_type:   String(items[0].account_type    ?? ''),
              });
            } else { setOcrStatus('error'); }
            return;
          }
          setQrMsg(null);
        }

        const resp = await fetch('/api/ocr-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, mimeType: file.type }),
        });
        const data = await resp.json();

        if (resp.ok && !data.error) {
          initChat({
            vendor:         String(data.vendor         ?? ''),
            amount:         String(data.amount          ?? ''),
            currency:       String(data.currency        ?? 'TZS'),
            date:           String(data.date            ?? ''),
            category:       String(data.category        ?? 'Other'),
            payment_method: String(data.payment_method  ?? ''),
            notes:          String(data.notes           ?? ''),
            account_type:   String(data.account_type    ?? ''),
          });
        } else { setOcrStatus('error'); }
      } catch { setOcrStatus('error'); }
      finally { setOcrLoading(false); }
    };
    reader.readAsDataURL(file);
  };

  const handleOcrScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    processOcrFile(file);
  };

  const stopCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (detectionIntervalRef.current) { clearInterval(detectionIntervalRef.current); detectionIntervalRef.current = null; }
    if (countdownTimeoutRef.current) { clearTimeout(countdownTimeoutRef.current); countdownTimeoutRef.current = null; }
    setCameraActive(false);
    setCameraCountdown(null);
    setCameraFlash(false);
  };

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1] ?? null;
  };

  const checkDocumentPresent = (): boolean => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return false;
    const canvas = document.createElement('canvas');
    const W = 320, H = 240;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, W, H);
    const x0 = Math.floor(W * 0.2), y0 = Math.floor(H * 0.2);
    const cw = Math.floor(W * 0.6), ch = Math.floor(H * 0.6);
    const { data } = ctx.getImageData(x0, y0, cw, ch);
    let sum = 0, sumSq = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += g; sumSq += g * g; n++;
    }
    const mean = sum / n;
    return (sumSq / n - mean * mean) > 800;
  };

  const handleCameraCapture = async () => {
    const base64 = captureFrame();
    stopCamera();
    if (!base64) return;
    setOcrLoading(true);
    setOcrStatus('idle');
    try {
      const resp = await fetch('/api/ocr-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' }),
      });
      const data = await resp.json();
      if (resp.ok && !data.error) {
        initChat({
          vendor:         String(data.vendor         ?? ''),
          amount:         String(data.amount          ?? ''),
          currency:       String(data.currency        ?? 'TZS'),
          date:           String(data.date            ?? ''),
          category:       String(data.category        ?? 'Other'),
          payment_method: String(data.payment_method  ?? ''),
          notes:          String(data.notes           ?? ''),
          account_type:   String(data.account_type    ?? ''),
        });
      } else { setOcrStatus('error'); }
    } catch { setOcrStatus('error'); }
    finally { setOcrLoading(false); }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraActive(true);

      let counting = false;
      detectionIntervalRef.current = setInterval(() => {
        if (counting) return;
        if (checkDocumentPresent()) {
          counting = true;
          setCameraFlash(true);
          setTimeout(() => setCameraFlash(false), 450);
          const tick = (n: number) => {
            setCameraCountdown(n);
            if (n <= 0) {
              setCameraCountdown(null);
              handleCameraCapture();
              counting = false;
              return;
            }
            countdownTimeoutRef.current = setTimeout(() => tick(n - 1), 1000);
          };
          tick(3);
        }
      }, 500);
    } catch (err) {
      console.error('Camera error:', err);
    }
  };

  const handleOcrSubmit = async (skipDupCheck = false) => {
    console.log('Save button clicked, skipDupCheck:', skipDupCheck, 'ocrFields:', ocrFields);
    if (!ocrFields) return;

    if (!skipDupCheck) {
      try {
        const isDup = await Promise.race([
          checkDuplicate(ocrFields.vendor, parseFloat(ocrFields.amount) || 0, ocrFields.date || null, undefined),
          new Promise<boolean>(resolve => setTimeout(() => resolve(false), 4000)),
        ]);
        if (isDup) {
          dupPendingRef.current = () => handleOcrSubmit(true);
          setDupWarning({ vendor: ocrFields.vendor, amount: parseFloat(ocrFields.amount) || 0, date: ocrFields.date || null });
          return;
        }
      } catch {
        console.warn('Duplicate check failed, proceeding with save');
      }
    }

    setIsProcessing(true);
    try {
      const receiptData: {
        vendor: string | null;
        amount: number;
        currency: string;
        date: string | null;
        time: string;
        category: string;
        account_type: Receipt['account_type'];
        payment_method: string | null;
        notes: string | null;
        status: string;
        user_id: null;
        submitted_by: string;
      } = {
        vendor:         ocrFields.vendor || null,
        amount:         parseFloat(ocrFields.amount) || 0,
        currency:       ocrFields.currency || 'TZS',
        date:           ocrFields.date || null,
        time:           '',
        category:       ocrFields.category || 'Other',
        account_type:   (ocrFields.account_type || 'Business') as Receipt['account_type'],
        payment_method: ocrFields.payment_method || null,
        notes:          ocrFields.notes || null,
        status:         'complete',
        user_id:        null,
        submitted_by:   fullName,
      };
      console.log('Saving receipt...', receiptData);
      const { data: insertData, error } = await supabase.from('receipts').insert(receiptData).select();
      console.log('Insert result:', insertData, error);
      if (!error) {
        await fetchReceipts();
        setIsAdding(false);
        resetOcr();
      } else {
        console.error('OCR submit error', error);
      }
    } catch (err) {
      console.error('OCR submit error', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTextParse = async () => {
    console.log('Text parse started', typeText);
    if (!typeText.trim()) return;
    setOcrLoading(true);
    setOcrStatus('idle');
    setOcrFields(null);
    setParsedItems([]);

    try {
      console.log('Calling API /api/parse-receipt-text ...');
      const resp = await fetch('/api/parse-receipt-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: typeText }),
      });
      console.log('API response status:', resp.status);
      const data = await resp.json();
      console.log('API response data:', data);
      const items: ParsedItem[] = Array.isArray(data) ? data : [];

      if (resp.ok && items.length === 1) {
        const item = items[0];
        initChat({
          vendor:         String(item.vendor         ?? ''),
          amount:         String(item.amount          ?? ''),
          currency:       String(item.currency        ?? 'TZS'),
          date:           String(item.date            ?? ''),
          category:       String(item.category        ?? 'Other'),
          payment_method: String(item.payment_method  ?? ''),
          notes:          String(item.notes           ?? ''),
          account_type:   String(item.account_type    ?? ''),
        });
      } else if (resp.ok && items.length > 1) {
        setParsedItems(items);
        setSelectedItems(new Set(items.map((_, i) => i)));
      } else {
        setOcrStatus('error');
      }
    } catch (err) {
      console.log('Text parse API call failed:', err);
      setOcrStatus('error');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSaveAllParsed = async () => {
    const toSave = parsedItems.filter((_, i) => selectedItems.has(i));
    if (toSave.length === 0) return;
    setIsSavingAll(true);
    try {
      const rows = toSave.map(item => ({
        vendor:         item.vendor ?? '',
        amount:         typeof item.amount === 'number' ? item.amount : (parseFloat(String(item.amount)) || 0),
        currency:       item.currency ?? 'TZS',
        date:           item.date ?? null,
        time:           '',
        category:       item.category ?? 'Other',
        account_type:   'Unknown',
        payment_method: item.payment_method ?? null,
        notes:          item.notes ?? null,
        status:         'logged',
        user_id:        null,
        submitted_by:   fullName,
      }));
      const { error } = await supabase.from('receipts').insert(rows);
      if (!error) {
        await fetchReceipts();
        setIsAdding(false);
        resetOcr();
      }
    } catch (err) {
      console.error('Save all error', err);
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleBulkProcess = async () => {
    if (bulkFiles.length === 0) return;
    setBulkProcessing(true);
    setBulkResults([]);
    setBulkSelected(new Set());
    setBulkSuccess(null);
    const results: BulkResult[] = [];
    for (let i = 0; i < bulkFiles.length; i++) {
      setBulkProgress({ current: i + 1, total: bulkFiles.length });
      const file = bulkFiles[i];
      try {
        const base64 = await fileToBase64(file);
        const resp = await fetch('/api/ocr-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, mimeType: file.type }),
        });
        const data = await resp.json();
        if (resp.ok && !data.error) {
          results.push({
            vendor:         String(data.vendor         ?? ''),
            amount:         typeof data.amount === 'number' ? data.amount : (parseFloat(String(data.amount)) || 0),
            currency:       String(data.currency        ?? 'TZS'),
            date:           data.date ? String(data.date) : null,
            category:       String(data.category       ?? 'Other'),
            payment_method: data.payment_method ? String(data.payment_method) : null,
            notes:          data.notes ? String(data.notes) : null,
          });
        } else {
          results.push({ vendor: '', amount: 0, currency: 'TZS', date: null, category: 'Other', payment_method: null, notes: null, error: true });
        }
      } catch {
        results.push({ vendor: '', amount: 0, currency: 'TZS', date: null, category: 'Other', payment_method: null, notes: null, error: true });
      }
    }
    const dupChecks = await Promise.all(results.map(r =>
      r.error ? Promise.resolve(false) : checkDuplicate(r.vendor, r.amount, r.date, undefined)
    ));
    dupChecks.forEach((isDup, i) => { if (isDup) results[i].duplicate = true; });

    setBulkResults(results);
    setBulkSelected(new Set(results.map((_, i) => i).filter(i => !results[i].error)));
    setBulkProgress(null);
    setBulkProcessing(false);
  };

  const handleBulkSave = async () => {
    const toSave = bulkResults.filter((r, i) => bulkSelected.has(i) && !r.error);
    if (toSave.length === 0) return;
    setBulkSaving(true);
    try {
      const rows = toSave.map(item => ({
        vendor: item.vendor || '', amount: item.amount || 0, currency: item.currency || 'TZS',
        date: item.date || null, time: '', category: item.category || 'Other',
        account_type: 'Business' as Receipt['account_type'],
        payment_method: item.payment_method || null, notes: item.notes || null,
        status: 'complete' as Receipt['status'], user_id: null, submitted_by: fullName,
      }));
      const { error } = await supabase.from('receipts').insert(rows);
      if (!error) {
        const count = toSave.length;
        setBulkSuccess(`${count} receipt${count !== 1 ? 's' : ''} saved successfully`);
        await fetchReceipts();
        setTimeout(() => { setIsAdding(false); resetOcr(); }, 2000);
      } else {
        console.error('Bulk save error', error);
      }
    } catch (err) {
      console.error('Bulk save error', err);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkUpdateItem = () => {
    if (bulkEditIndex === null || !ocrFields) return;
    setBulkResults(prev => prev.map((item, i) => i === bulkEditIndex ? {
      ...item,
      vendor:         ocrFields.vendor         || item.vendor,
      amount:         parseFloat(ocrFields.amount) || item.amount,
      currency:       ocrFields.currency        || item.currency,
      date:           ocrFields.date            || item.date,
      category:       ocrFields.category        || item.category,
      payment_method: ocrFields.payment_method  || item.payment_method,
      notes:          ocrFields.notes           || item.notes,
      error:          false,
    } : item));
    setOcrFields(null);
    setBulkEditIndex(null);
    setModalTab('bulk');
  };

  const checkDuplicate = async (vendor: string, amount: number, date: string | null, _userId?: string): Promise<boolean> => {
    if (!vendor || !amount) return false;
    try {
      let q = supabase.from('receipts').select('id', { count: 'exact', head: true }).eq('vendor', vendor).eq('amount', amount);
      if (date) q = q.eq('date', date);
      const { count } = await q;
      return (count ?? 0) > 0;
    } catch {
      return false;
    }
  };

  const handleDupSaveAnyway = async () => {
    setDupWarning(null);
    if (dupPendingRef.current) {
      await dupPendingRef.current();
      dupPendingRef.current = null;
    }
  };

  const isIncomplete = (r: Receipt) =>
    !r.vendor || r.vendor === 'Unknown' ||
    r.amount === 0 ||
    r.account_type === 'Unknown' ||
    (r.category === 'Other' && !r.notes);

  const handleAddCategory = (name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (allCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) return trimmed;
    const updated = [...customCategories, trimmed];
    setCustomCategories(updated);
    localStorage.setItem('custom_categories', JSON.stringify(updated));
    return trimmed;
  };

  const closeQuickCategory = () => {
    setQuickCategoryId(null);
    setQuickCategoryPos(null);
  };

  const handleQuickCategory = async (id: string, category: string) => {
    closeQuickCategory();
    try {
      const { error } = await supabase.from('receipts').update({ category }).eq('id', id);
      if (error) throw error;
      setReceipts(prev => prev.map(r => r.id === id ? { ...r, category } : r));
    } catch (e) {
      console.error('Quick category update failed:', e instanceof Error ? e.message : e);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedReceipt) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('receipts')
        .update({
          vendor:         editForm.vendor,
          amount:         editForm.amount,
          currency:       editForm.currency,
          category:       editForm.category,
          account_type:   editForm.account_type,
          payment_method: editForm.payment_method || null,
          notes:          editForm.notes || null,
        })
        .eq('id', selectedReceipt.id)
        .select()
        .single();
      if (!error && data) {
        setReceipts(prev => prev.map(r => r.id === selectedReceipt.id ? { ...r, ...data } : r));
        setSelectedReceipt(prev => prev ? { ...prev, ...data } : null);
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
        const { error } = await supabase.from('receipts').delete().eq('id', id);
        if (!error) {
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

  useEffect(() => {
    if (!isAdding) return;
    supabase.from('shipments').select('id, commodity, reference_number, type')
      .then(({ data }) => setModalShipments((data ?? []) as ModalShipment[]));
  }, [isAdding]);

  useEffect(() => {
    if (!isAdding) {
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      if (detectionIntervalRef.current) { clearInterval(detectionIntervalRef.current); detectionIntervalRef.current = null; }
      if (countdownTimeoutRef.current) { clearTimeout(countdownTimeoutRef.current); countdownTimeoutRef.current = null; }
      setCameraActive(false); setCameraCountdown(null); setCameraFlash(false);
    }
  }, [isAdding]);

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const totalSpent = useMemo(
    () => filteredReceipts.reduce((s, r) => s + toTZS(r.amount, r.currency), 0),
    [filteredReceipts],
  );

  const hasForeignReceipts = useMemo(
    () => filteredReceipts.some(r => isForeignCurrency(r.currency)),
    [filteredReceipts],
  );

  const totalRevenue = useMemo(
    () => sales.reduce((s, r) => s + toTZS(r.amount, r.currency), 0),
    [sales],
  );

  const hasForeignSales = useMemo(
    () => sales.some(r => isForeignCurrency(r.currency)),
    [sales],
  );

  const totalSpentUnfiltered = useMemo(
    () => receipts.reduce((s, r) => s + toTZS(r.amount, r.currency), 0),
    [receipts],
  );

  const netProfit = useMemo(
    () => totalRevenue - totalSpentUnfiltered,
    [totalRevenue, totalSpentUnfiltered],
  );

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
    const total = filtered.reduce((s, r) => s + toTZS(r.amount, r.currency), 0);
    const byCategory: Record<string, number> = {};
    filtered.forEach(r => { byCategory[r.category] = (byCategory[r.category] || 0) + toTZS(r.amount, r.currency); });
    return { total, count: filtered.length, byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]) };
  }, [receipts, reportPeriod]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredReceipts.forEach(r => { totals[r.category] = (totals[r.category] || 0) + toTZS(r.amount, r.currency); });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [filteredReceipts]);

  const allCategories = useMemo(() => [...CATEGORIES, ...customCategories], [customCategories]);

  const uncategorizedCount = useMemo(() => receipts.filter(r => r.category === 'Other').length, [receipts]);

  const fullName = profile?.full_name || session?.user.email || 'User';

  const NAV_ITEMS: { key: Page; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: 'receipts',  label: 'Receipts',  icon: <Wallet className="w-4 h-4" /> },
    { key: 'shipments', label: 'Shipments', icon: <Package className="w-4 h-4" /> },
    { key: 'sales',     label: 'Sales',     icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'clients',   label: 'Clients',   icon: <Users className="w-4 h-4" /> },
  ];

  const goToShipments = () => { setCurrentPage('shipments'); setSelectedShipmentId(null); };

  if (authLoading) {
    return (
      <div className="w-full max-w-[100vw] min-h-screen bg-brand-bg text-white font-sans flex items-center justify-center">
        <div className="flex flex-col items-center space-y-6">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-brand-accent/20 rounded-full animate-spin border-t-brand-accent" />
            <Activity className="absolute inset-0 m-auto w-8 h-8 text-brand-accent animate-pulse" />
          </div>
          <div className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest">Loading...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

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

          <button
            onClick={() => supabase.auth.signOut()}
            className="p-2 rounded-xl border border-brand-border text-brand-text-muted hover:text-red-400 hover:border-red-400/40 transition-all"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-brand-border/50 rounded-lg border border-brand-border">
            <div className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-pulse" />
            <span className="text-[10px] font-mono text-brand-text-muted uppercase tracking-tighter">Cloud Sync</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-border/50 rounded-lg border border-brand-border">
            <span className="text-[10px] font-mono text-brand-accent uppercase tracking-tighter">
              {profile?.role === 'admin' ? 'Admin' : 'Accountant'}
            </span>
          </div>

<button
            onClick={() => setShowExport(true)}
            className="hidden md:flex border border-brand-border text-brand-text-muted px-4 py-2.5 rounded-full text-sm font-bold items-center gap-2 hover:border-brand-accent/40 hover:text-brand-accent transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            EXPORT
          </button>

          <button
            onClick={() => setIsAdding(true)}
            className="hidden md:flex bg-brand-accent text-black px-5 py-2.5 rounded-full text-sm font-bold items-center gap-2 hover:scale-105 transition-all active:scale-95 shadow-[0_0_30px_rgba(0,255,102,0.2)]"
          >
            <Plus className="w-4 h-4" />
            ADD RECEIPT
          </button>

          <div className="flex items-center gap-3 pl-3 border-l border-brand-border">
            <div className="w-8 h-8 rounded-full bg-brand-card border border-brand-border flex items-center justify-center text-xs font-bold text-brand-accent uppercase">
              {fullName.charAt(0)}
            </div>
            <span className="hidden md:block text-[10px] font-mono text-brand-text-muted uppercase tracking-widest max-w-[100px] truncate">
              {fullName}
            </span>
          </div>
        </div>
      </header>

      {/* Pages */}
      {currentPage === 'dashboard' && (
        <DashboardPage
          receipts={receipts}
          sales={sales}
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

      {currentPage === 'sales' && (
        <>
          {salesError && (
            <div className="max-w-6xl mx-auto px-6 pt-6">
              <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-2xl border border-red-500/40 bg-red-500/8 text-red-400">
                <span className="text-[11px] font-mono">⚠ Could not load sales: {salesError}</span>
                <button
                  onClick={fetchSales}
                  className="flex-shrink-0 text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border border-red-500/40 hover:bg-red-500/20 transition-all"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          <SalesPage
            forceOpenModal={openSaleModal}
            onForceOpenModalHandled={() => setOpenSaleModal(false)}
            totalRevenue={totalRevenue}
            netProfit={netProfit}
            hasForeignSales={hasForeignSales}
            onSaleLogged={fetchSales}
            onViewClients={() => setCurrentPage('clients')}
          />
        </>
      )}

      {currentPage === 'clients' && (
        <ClientsPage sales={sales} />
      )}

      {currentPage === 'receipts' && (
        <main className="w-full max-w-4xl mx-auto px-6 pt-10 pb-28 md:pb-10 space-y-10 overflow-x-hidden box-border">
          {/* Receipts error banner */}
          {receiptsError && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-2xl border border-red-500/40 bg-red-500/8 text-red-400">
              <span className="text-[11px] font-mono">⚠ Could not load receipts: {receiptsError}</span>
              <button
                onClick={fetchReceipts}
                className="flex-shrink-0 text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border border-red-500/40 hover:bg-red-500/20 transition-all"
              >
                Retry
              </button>
            </div>
          )}
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
              <div className="mt-8 flex items-center gap-4 text-xs font-mono text-brand-text-muted flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-brand-accent">●</span>
                  <span>{receipts.length} RECEIPTS STORED</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-brand-accent">●</span>
                  <span>{allCategories.length} CATEGORIES</span>
                </div>
                {hasForeignReceipts && (
                  <div className="flex items-center gap-1 text-amber-400">
                    <span>●</span>
                    <span>CONVERTED TO TSH</span>
                  </div>
                )}
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
            {/* Search + Add Category */}
            <div className="flex gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                <input
                  type="text"
                  placeholder="SEARCH ARCHIVE..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 bg-brand-card border border-brand-border rounded-2xl focus:outline-none focus:border-brand-accent/50 focus:ring-4 focus:ring-brand-accent/5 transition-all font-mono text-xs uppercase tracking-widest"
                />
              </div>
              {showNewCatInFilter ? (
                <form
                  className="flex items-center gap-2 flex-shrink-0"
                  onSubmit={e => {
                    e.preventDefault();
                    const created = handleAddCategory(newCatInput);
                    if (created) setFilterCategory(created);
                    setNewCatInput('');
                    setShowNewCatInFilter(false);
                  }}
                >
                  <input
                    autoFocus
                    value={newCatInput}
                    onChange={e => setNewCatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && setShowNewCatInFilter(false)}
                    placeholder="Category name..."
                    className="px-3 py-3 rounded-2xl text-[11px] font-mono border border-brand-accent/50 bg-brand-card text-white focus:outline-none w-40"
                  />
                  <button type="submit" className="px-4 py-3 rounded-2xl text-[10px] font-mono font-bold bg-brand-accent text-black hover:scale-105 transition-all active:scale-95">
                    Add
                  </button>
                  <button type="button" onClick={() => setShowNewCatInFilter(false)} className="p-3 rounded-2xl text-brand-text-muted border border-brand-border hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => { setShowNewCatInFilter(true); setNewCatInput(''); }}
                  className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-brand-border text-brand-text-muted font-mono text-[10px] uppercase tracking-widest hover:border-brand-accent/50 hover:text-brand-accent transition-all flex-shrink-0"
                >
                  <Tag className="w-3.5 h-3.5" />
                  Add Category
                </button>
              )}
            </div>

            {/* Category filter pills */}
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {['All', ...allCategories].map(cat => (
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

              {/* Uncategorized banner */}
              {uncategorizedCount > 0 && (
                <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl border border-orange-500/30 bg-orange-500/5">
                  <div className="flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[10px] font-mono text-orange-400">
                      {uncategorizedCount} receipt{uncategorizedCount > 1 ? 's' : ''} need{uncategorizedCount === 1 ? 's' : ''} a category
                    </span>
                  </div>
                  <button
                    onClick={() => setFilterCategory('Other')}
                    className="text-[9px] font-mono font-bold uppercase tracking-widest text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    Show →
                  </button>
                </div>
              )}

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
                            setIsEditing(false);
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
                                {receipt.category === 'Other' ? (
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setQuickCategoryId(receipt.id);
                                      setQuickCategoryPos({ top: rect.bottom + 6, left: rect.left });
                                    }}
                                    className="flex items-center gap-1 text-orange-400 hover:text-orange-300 font-bold uppercase transition-colors"
                                  >
                                    <Tag className="w-2.5 h-2.5" />
                                    Other
                                  </button>
                                ) : (
                                  <span className="uppercase">{receipt.category}</span>
                                )}
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
                              {isForeignCurrency(receipt.currency) && (
                                <div className="text-[9px] font-mono text-amber-400/80 mt-0.5">
                                  ≈ TSh {toTZS(receipt.amount, receipt.currency).toLocaleString()}
                                </div>
                              )}
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
              initial={{ opacity: 0, y: 56 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
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

              {/* ── Saving spinner ── */}
              {isProcessing ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-6">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-brand-accent/20 rounded-full animate-spin border-t-brand-accent" />
                    <Activity className="absolute inset-0 m-auto w-8 h-8 text-brand-accent animate-pulse" />
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-xl uppercase tracking-tighter">Saving Receipt...</div>
                    <div className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest mt-2">Writing to database</div>
                  </div>
                </div>

              /* ── AI loading spinner ── */
              ) : ocrLoading ? (
                <div className="py-8 flex flex-col items-center justify-center space-y-5">
                  {ocrPreview ? (
                    <div className="relative w-40 h-48 rounded-2xl overflow-hidden border border-brand-accent/30 shadow-[0_0_20px_rgba(0,255,102,0.12)]">
                      <img src={ocrPreview} alt="Receipt preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/20" />
                      <div className="scanner-beam" />
                    </div>
                  ) : (
                    <div className="relative w-16 h-16 rounded-2xl bg-brand-card border border-brand-accent/30 flex items-center justify-center">
                      <Loader2 className="w-7 h-7 text-brand-accent animate-spin" />
                    </div>
                  )}
                  <div className="text-center space-y-1">
                    <div className="text-sm font-bold font-mono uppercase tracking-tight text-brand-accent">
                      {qrMsg ?? 'Analyzing receipt...'}
                    </div>
                    <div className="text-[9px] font-mono text-brand-text-muted uppercase tracking-widest">
                      Claude AI is extracting fields
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-bounce"
                           style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setOcrLoading(false);
                      setOcrFields({ vendor: '', amount: '', currency: 'TZS', date: '', category: 'Other', payment_method: '', notes: '', account_type: 'Business' });
                    }}
                    className="text-[9px] font-mono text-brand-text-muted/50 uppercase tracking-widest hover:text-brand-text-muted transition-colors">
                    Enter manually →
                  </button>
                </div>

              /* ── Duplicate warning ── */
              ) : dupWarning ? (
                <div className="space-y-6 py-4">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center border border-orange-500/30">
                      <span className="text-2xl">⚠️</span>
                    </div>
                    <div>
                      <div className="font-bold text-lg uppercase tracking-tighter text-orange-400">Possible Duplicate</div>
                      <p className="text-[10px] font-mono text-brand-text-muted mt-2 leading-relaxed">
                        A receipt from <span className="text-white font-bold">{dupWarning.vendor}</span> for{' '}
                        <span className="text-white font-bold">TZS {dupWarning.amount.toLocaleString()}</span>
                        {dupWarning.date ? <> on <span className="text-white font-bold">{dupWarning.date}</span></> : ''}{' '}
                        already exists in your records.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setDupWarning(null); dupPendingRef.current = null; }}
                      className="flex-1 py-3 rounded-2xl border border-brand-border text-brand-text-muted font-mono text-[10px] uppercase tracking-widest hover:border-brand-text-muted hover:text-white transition-all">
                      Cancel
                    </button>
                    <button
                      onClick={handleDupSaveAnyway}
                      className="flex-1 py-3 rounded-2xl bg-orange-500 text-white font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">
                      Save Anyway
                    </button>
                  </div>
                </div>

              /* ── AI chat step ── */
              ) : chatActive ? (
                <div className="space-y-4">
                  {/* Summary card */}
                  {chatExtracted && (
                    <div className="p-3 rounded-xl border border-brand-accent/40 bg-brand-accent/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold font-mono uppercase tracking-tight">{chatExtracted.vendor || 'Receipt'}</div>
                          <div className="text-[9px] font-mono text-brand-text-muted mt-0.5">{chatExtracted.date || '—'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold font-mono text-brand-accent">
                            {chatExtracted.currency || 'TZS'} {(parseFloat(chatExtracted.amount) || 0).toLocaleString()}
                          </div>
                          <div className="text-[9px] font-mono text-brand-text-muted uppercase">{chatExtracted.category}</div>
                        </div>
                      </div>
                      {(chatExtracted.account_type === 'Business' || chatExtracted.account_type === 'Personal') && (
                        <div className="flex">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase border ${
                            chatExtracted.account_type === 'Business'
                              ? 'bg-brand-accent/10 text-brand-accent border-brand-accent/30'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          }`}>
                            ✦ {chatExtracted.account_type}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Chat bubbles */}
                  <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-1">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs font-mono leading-relaxed ${
                          msg.role === 'ai'
                            ? 'bg-brand-card border-l-2 border-brand-accent text-white'
                            : 'bg-brand-accent text-black font-bold'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Response buttons */}
                  {chatPhase === 'account_type' && (
                    <div className="flex gap-2">
                      {(['Business', 'Personal'] as const).map(opt => (
                        <button key={opt} onClick={() => handleChatAnswer(opt)}
                          className={`flex-1 py-3 rounded-xl border font-mono text-[10px] uppercase tracking-widest transition-all font-bold ${
                            opt === 'Business'
                              ? 'border-brand-accent/60 text-brand-accent hover:bg-brand-accent hover:text-black'
                              : 'border-brand-border text-brand-text-muted hover:border-brand-text-muted hover:text-white'
                          }`}>{opt}</button>
                      ))}
                    </div>
                  )}

                  {chatPhase === 'category' && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['Food', 'Transport', 'Utilities', 'Supplies', 'Services', 'Accommodation'] as const).map(cat => (
                        <button key={cat} onClick={() => handleChatAnswer(cat)}
                          className="py-2 rounded-xl border border-brand-border text-brand-text-muted font-mono text-[9px] uppercase tracking-widest hover:border-brand-accent/50 hover:text-brand-accent transition-all">
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}

                  {chatPhase === 'shipment' && (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {modalShipments.map(s => (
                        <button key={s.id}
                          onClick={() => handleChatAnswer(`${s.reference_number} — ${s.commodity}`)}
                          className="w-full py-2 px-3 rounded-xl border border-brand-border text-left font-mono text-[10px] text-brand-text-muted hover:border-brand-accent/50 hover:text-white transition-all">
                          <span className="text-brand-accent">{s.reference_number}</span> · {s.commodity}
                        </button>
                      ))}
                      <button onClick={() => handleChatAnswer('No shipment link')}
                        className="w-full py-2 px-3 rounded-xl border border-dashed border-brand-border/50 font-mono text-[9px] text-brand-text-muted/60 hover:text-brand-text-muted transition-all">
                        Skip — no shipment link
                      </button>
                    </div>
                  )}

                  {chatPhase === 'confirm' && (
                    <button onClick={goToForm}
                      className="w-full py-3 rounded-2xl bg-brand-accent text-black font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
                      <Check className="w-3.5 h-3.5" />
                      Review &amp; Save Receipt
                    </button>
                  )}

                  <button onClick={goToForm}
                    className="w-full py-2 rounded-xl border border-brand-border/50 text-center text-[9px] font-mono text-brand-text-muted uppercase tracking-widest hover:text-white hover:border-brand-border transition-colors">
                    Skip to form →
                  </button>
                </div>

              /* ── Single item: editable review form ── */
              ) : ocrFields ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      {ocrPreview && (
                        <img src={ocrPreview} alt="Scanned receipt" className="w-16 h-16 object-cover rounded-xl border border-brand-border flex-shrink-0" />
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 text-brand-accent">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                            <path d="M3 8.5L6.5 12L13 5" stroke="currentColor" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round"
                              strokeDasharray="28" strokeDashoffset="28"
                              style={{ animation: 'checkmarkDraw 0.45s ease-out 0.05s forwards' }} />
                          </svg>
                          <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Receipt scanned — please review</span>
                        </div>
                        <p className="text-[9px] font-mono text-brand-text-muted mt-1">Edit any fields then save.</p>
                      </div>
                    </div>
                    {bulkEditIndex === null && (
                      <button
                        onClick={() => handleOcrSubmit(true)}
                        className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-brand-accent/40 text-brand-accent font-mono text-[8px] uppercase tracking-widest hover:bg-brand-accent hover:text-black transition-all">
                        Quick Save →
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Vendor</label>
                      <input type="text" value={ocrFields.vendor}
                        onChange={e => setOcrFields(f => f ? { ...f, vendor: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all" />
                    </div>
                    <div>
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Amount</label>
                      <input type="number" value={ocrFields.amount}
                        onChange={e => setOcrFields(f => f ? { ...f, amount: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all" />
                    </div>
                    <div>
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Currency</label>
                      <input type="text" value={ocrFields.currency}
                        onChange={e => setOcrFields(f => f ? { ...f, currency: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all" />
                    </div>
                    <div>
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Date</label>
                      <input type="date" value={ocrFields.date}
                        onChange={e => setOcrFields(f => f ? { ...f, date: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all" />
                    </div>
                    <div>
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Category</label>
                      <select value={allCategories.includes(ocrFields.category) ? ocrFields.category : 'Other'}
                        onChange={e => setOcrFields(f => f ? { ...f, category: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all">
                        {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Payment Method</label>
                      <select value={ocrFields.payment_method}
                        onChange={e => setOcrFields(f => f ? { ...f, payment_method: e.target.value } : f)}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all">
                        <option value="">— Unknown —</option>
                        <option value="Cash">Cash</option>
                        <option value="M-Pesa">M-Pesa</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Card">Card</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5">Notes</label>
                      <textarea value={ocrFields.notes}
                        onChange={e => setOcrFields(f => f ? { ...f, notes: e.target.value } : f)}
                        rows={2}
                        className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all resize-none" />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => {
                        if (bulkEditIndex !== null) { setOcrFields(null); setBulkEditIndex(null); setModalTab('bulk'); }
                        else { resetOcr(); }
                      }}
                      className="flex-1 py-3 rounded-2xl border border-brand-border text-brand-text-muted font-mono text-[10px] uppercase tracking-widest hover:border-brand-text-muted hover:text-white transition-all">
                      ← Back
                    </button>
                    {bulkEditIndex !== null ? (
                      <button onClick={handleBulkUpdateItem}
                        className="flex-1 py-3 rounded-2xl bg-brand-accent text-black font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
                        <Check className="w-3.5 h-3.5" />
                        Update in List
                      </button>
                    ) : (
                      <button onClick={() => handleOcrSubmit()}
                        className="flex-1 py-3 rounded-2xl bg-brand-accent text-black font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
                        <Check className="w-3.5 h-3.5" />
                        Save Receipt
                      </button>
                    )}
                  </div>
                </div>

              /* ── Multi-item checklist (TYPE mode) ── */
              ) : parsedItems.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest">
                      {parsedItems.length} items parsed
                    </p>
                    <button
                      onClick={() => setSelectedItems(prev =>
                        prev.size === parsedItems.length ? new Set() : new Set(parsedItems.map((_, i) => i))
                      )}
                      className="text-[9px] font-mono text-brand-accent uppercase tracking-widest hover:opacity-70 transition-opacity"
                    >
                      {selectedItems.size === parsedItems.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {parsedItems.map((item, i) => (
                      <label key={i} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedItems.has(i) ? 'border-brand-accent/40 bg-brand-accent/5' : 'border-brand-border bg-brand-bg hover:border-brand-border/60'
                      }`}>
                        <input
                          type="checkbox"
                          checked={selectedItems.has(i)}
                          onChange={() => setSelectedItems(prev => {
                            const next = new Set(prev);
                            next.has(i) ? next.delete(i) : next.add(i);
                            return next;
                          })}
                          className="mt-0.5 accent-[#00FF66] flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-xs uppercase tracking-tight">{item.vendor || 'Unknown'}</div>
                          <div className="text-[10px] font-mono text-brand-text-muted mt-0.5">
                            {item.currency || 'TZS'} {(item.amount || 0).toLocaleString()} · {item.category}
                            {item.date ? ` · ${item.date}` : ''}
                            {item.payment_method ? ` · ${item.payment_method}` : ''}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={resetOcr}
                      className="flex-1 py-3 rounded-2xl border border-brand-border text-brand-text-muted font-mono text-[10px] uppercase tracking-widest hover:border-brand-text-muted hover:text-white transition-all">
                      ← Back
                    </button>
                    <button onClick={handleSaveAllParsed} disabled={selectedItems.size === 0 || isSavingAll}
                      className="flex-1 py-3 rounded-2xl bg-brand-accent text-black font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                      {isSavingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Save {selectedItems.size === 1 ? '1 Receipt' : `${selectedItems.size} Receipts`}
                    </button>
                  </div>
                </div>

              /* ── Default: tab selector ── */
              ) : (
                <div className="space-y-5">
                  {/* Tab bar */}
                  <div className="flex p-1 bg-brand-bg rounded-xl border border-brand-border">
                    {(['scan', 'type', 'bulk'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => { setModalTab(tab); setOcrStatus('idle'); setBulkDragging(false); setScanDragging(false); if (cameraActive) stopCamera(); }}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all ${
                          modalTab === tab ? 'bg-brand-accent text-black font-bold' : 'text-brand-text-muted hover:text-white'
                        }`}
                      >
                        {tab === 'scan' ? 'Scan' : tab === 'type' ? 'Type' : 'Bulk'}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                  {/* SCAN tab */}
                  {modalTab === 'scan' && (
                    <motion.div
                      key="scan-tab"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      {cameraActive ? (
                        /* ── Live camera view ── */
                        <div className="space-y-3">
                          <div className="relative rounded-2xl overflow-hidden bg-black border border-brand-border"
                               style={{ aspectRatio: '4/3' }}>
                            <video
                              ref={videoRef}
                              className="w-full h-full object-cover"
                              playsInline
                              muted
                              autoPlay
                            />
                            {/* Receipt guide frame */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-[72%] h-[75%] rounded-2xl border-2 border-brand-accent"
                                   style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45), 0 0 20px rgba(0,255,102,0.25) inset' }} />
                            </div>
                            {/* Detection flash */}
                            {cameraFlash && (
                              <div className="absolute inset-0 bg-brand-accent/25 camera-flash pointer-events-none" />
                            )}
                            {/* Countdown */}
                            {cameraCountdown !== null && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                                <div className="px-4 py-1.5 bg-brand-accent text-black rounded-full text-[10px] font-bold font-mono uppercase tracking-widest">
                                  Receipt detected!
                                </div>
                                <div className="text-6xl font-bold text-white font-mono tabular-nums"
                                     style={{ textShadow: '0 0 30px rgba(0,255,102,0.5)' }}>
                                  {cameraCountdown}
                                </div>
                              </div>
                            )}
                            {/* Corner markers */}
                            <div className="absolute top-[12.5%] left-[14%] w-4 h-4 border-t-2 border-l-2 border-brand-accent rounded-tl pointer-events-none" />
                            <div className="absolute top-[12.5%] right-[14%] w-4 h-4 border-t-2 border-r-2 border-brand-accent rounded-tr pointer-events-none" />
                            <div className="absolute bottom-[12.5%] left-[14%] w-4 h-4 border-b-2 border-l-2 border-brand-accent rounded-bl pointer-events-none" />
                            <div className="absolute bottom-[12.5%] right-[14%] w-4 h-4 border-b-2 border-r-2 border-brand-accent rounded-br pointer-events-none" />
                          </div>
                          <p className="text-center text-[9px] font-mono text-brand-text-muted uppercase tracking-widest">
                            Align receipt within the frame — auto-detects when ready
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={handleCameraCapture}
                              className="flex-1 py-3 rounded-2xl bg-brand-accent text-black font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              Capture Now
                            </button>
                            <button
                              onClick={stopCamera}
                              className="px-5 py-3 rounded-2xl border border-brand-border text-brand-text-muted font-mono text-[10px] uppercase tracking-widest hover:border-brand-text-muted hover:text-white transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── Upload UI ── */
                        <div className="space-y-4">
                          {/* Header with pulsing camera icon */}
                          <div className="text-center space-y-3 pt-1">
                            <div className="relative w-[72px] h-[72px] mx-auto">
                              <div className="absolute inset-0 rounded-full border-2 border-brand-accent/40"
                                   style={{ animation: 'pulseRing 2s ease-out infinite' }} />
                              <div className="absolute inset-0 rounded-full border border-brand-accent/20"
                                   style={{ animation: 'pulseRing 2s ease-out 0.6s infinite' }} />
                              <div className="relative w-full h-full rounded-full bg-brand-card border border-brand-accent/50 flex items-center justify-center shadow-[0_0_24px_rgba(0,255,102,0.18)]">
                                <Camera className="w-7 h-7 text-brand-accent" />
                              </div>
                            </div>
                            <div>
                              <h3 className="text-lg font-bold font-mono uppercase tracking-tight">SCAN RECEIPT</h3>
                              <p className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest mt-1">
                                AI extracts all fields automatically
                              </p>
                            </div>
                          </div>

                          {/* Drag & drop zone */}
                          <div
                            onDragOver={(e) => { e.preventDefault(); setScanDragging(true); }}
                            onDragLeave={() => setScanDragging(false)}
                            onDrop={(e) => {
                              e.preventDefault(); setScanDragging(false);
                              const file = e.dataTransfer.files?.[0];
                              if (file) processOcrFile(file);
                            }}
                            className={`relative border-2 rounded-2xl p-5 text-center transition-all duration-200 ${
                              scanDragging
                                ? 'border-brand-accent bg-brand-accent/8 shadow-[0_0_24px_rgba(0,255,102,0.2)]'
                                : 'border-dashed border-brand-border/70 hover:border-brand-accent/60 hover:shadow-[0_0_16px_rgba(0,255,102,0.08)] scan-drop-zone-idle'
                            }`}
                          >
                            <label className="flex flex-col items-center gap-2.5 cursor-pointer">
                              <p className="text-[11px] font-mono text-brand-text-muted leading-relaxed">
                                Drop receipt here or{' '}
                                <span className="text-brand-accent font-bold">click to browse</span>
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                                {['JPEG', 'PNG', 'PDF', 'HEIC'].map(t => (
                                  <span key={t} className="px-2 py-0.5 rounded text-[8px] font-mono border border-brand-border/60 text-brand-text-muted/70 uppercase tracking-wider">
                                    {t}
                                  </span>
                                ))}
                              </div>
                              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleOcrScan} />
                            </label>
                          </div>

                          {/* Divider */}
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-brand-border/50" />
                            <span className="text-[9px] font-mono text-brand-text-muted uppercase tracking-widest">or</span>
                            <div className="flex-1 h-px bg-brand-border/50" />
                          </div>

                          {/* Camera button */}
                          <button
                            onClick={startCamera}
                            className="w-full py-3 rounded-2xl border border-brand-accent/40 text-brand-accent font-mono text-[10px] uppercase tracking-widest hover:bg-brand-accent hover:text-black transition-all flex items-center justify-center gap-2 group"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            Use Camera
                          </button>

                          {ocrStatus === 'error' && (
                            <motion.p
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="text-center text-[9px] font-mono text-red-400 uppercase tracking-widest"
                            >
                              Could not read receipt — try again or switch to Type mode
                            </motion.p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TYPE tab */}
                  {modalTab === 'type' && (
                    <motion.div
                      key="type-tab"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-4"
                    >
                      <textarea
                        value={typeText}
                        onChange={e => setTypeText(e.target.value)}
                        rows={5}
                        placeholder={"e.g. Lunch at Mama Ntilie 8500, paid cash\nfuel 45000 TotalEnergies, card\n3 items: rice 12000, sugar 4500, oil 8000"}
                        className="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm font-mono text-white placeholder:text-brand-text-muted/40 focus:outline-none focus:border-brand-accent/50 transition-all resize-none leading-relaxed"
                      />
                      <button
                        onClick={handleTextParse}
                        className="w-full py-4 rounded-2xl bg-brand-accent text-black font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <Activity className="w-4 h-4" />
                        Parse with AI
                      </button>
                      {ocrStatus === 'error' && (
                        <p className="text-center text-[9px] font-mono text-red-400 uppercase tracking-widest">
                          Could not parse — try rephrasing or adding more detail
                        </p>
                      )}
                    </motion.div>
                  )}

                  {/* BULK tab */}
                  {modalTab === 'bulk' && (
                    <motion.div
                      key="bulk-tab"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      {/* Drop zone */}
                      {!bulkSuccess && (
                        <div
                          onDragOver={(e) => { e.preventDefault(); setBulkDragging(true); }}
                          onDragLeave={() => setBulkDragging(false)}
                          onDrop={(e) => {
                            e.preventDefault(); setBulkDragging(false);
                            const files = Array.from(e.dataTransfer.files).filter(
                              f => f.type.startsWith('image/') || f.type === 'application/pdf'
                            );
                            if (files.length) { setBulkFiles(prev => [...prev, ...files]); setBulkResults([]); setBulkSuccess(null); }
                          }}
                          className={`w-full py-6 border-2 rounded-2xl text-center transition-all ${
                            bulkDragging ? 'border-brand-accent bg-brand-accent/10' : 'border-dashed border-brand-border hover:border-brand-accent/50 cursor-pointer'
                          }`}
                        >
                          <label className="flex flex-col items-center gap-2 cursor-pointer">
                            <div className="w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center">
                              <Layers className="w-5 h-5 text-brand-accent" />
                            </div>
                            <p className="text-sm font-bold uppercase tracking-tight text-brand-accent">Drop receipts here</p>
                            <p className="text-[9px] font-mono text-brand-text-muted uppercase tracking-widest">
                              or click to select — any number of images or PDFs
                            </p>
                            <input type="file" multiple accept="image/*,application/pdf" className="hidden"
                              onChange={(e) => {
                                const files = Array.from(e.target.files ?? []);
                                if (files.length) { setBulkFiles(prev => [...prev, ...files]); setBulkResults([]); setBulkSuccess(null); }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      )}

                      {/* File list */}
                      {bulkFiles.length > 0 && !bulkSuccess && !bulkProcessing && !bulkResults.length && (
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {bulkFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-brand-bg rounded-lg border border-brand-border">
                              <span className="text-[10px] font-mono text-white truncate flex-1">{f.name}</span>
                              <span className="text-[9px] font-mono text-brand-text-muted flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                              <button onClick={() => setBulkFiles(prev => prev.filter((_, j) => j !== i))}
                                className="text-brand-text-muted hover:text-red-400 transition-colors flex-shrink-0">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Progress bar */}
                      {bulkProgress && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-mono text-brand-text-muted uppercase">
                            <span>Processing {bulkProgress.current} of {bulkProgress.total}...</span>
                            <span>{Math.round((bulkProgress.current / bulkProgress.total) * 100)}%</span>
                          </div>
                          <div className="h-1.5 bg-brand-border rounded-full overflow-hidden">
                            <div className="h-full bg-brand-accent transition-all duration-300 rounded-full"
                              style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }} />
                          </div>
                        </div>
                      )}

                      {/* Process button */}
                      {bulkFiles.length > 0 && !bulkProcessing && !bulkResults.length && !bulkSuccess && (
                        <button onClick={handleBulkProcess}
                          className="w-full py-3 rounded-2xl bg-brand-accent text-black font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2">
                          <Activity className="w-4 h-4" />
                          Process All ({bulkFiles.length})
                        </button>
                      )}

                      {/* Extracted results */}
                      {bulkResults.length > 0 && !bulkSuccess && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest">
                              {bulkResults.filter(r => !r.error).length}/{bulkResults.length} extracted
                            </p>
                            <button
                              onClick={() => {
                                const valid = bulkResults.map((_, i) => i).filter(i => !bulkResults[i].error);
                                setBulkSelected(prev => prev.size === valid.length ? new Set() : new Set(valid));
                              }}
                              className="text-[9px] font-mono text-brand-accent uppercase tracking-widest hover:opacity-70 transition-opacity">
                              {bulkSelected.size === bulkResults.filter(r => !r.error).length ? 'Deselect All' : 'Select All'}
                            </button>
                          </div>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                            {bulkResults.map((item, i) => (
                              <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                                item.error ? 'border-red-500/30 bg-red-500/5'
                                  : item.duplicate ? 'border-orange-500/40 bg-orange-500/5'
                                  : bulkSelected.has(i) ? 'border-brand-accent/40 bg-brand-accent/5'
                                  : 'border-brand-border bg-brand-bg'
                              }`}>
                                {!item.error && (
                                  <input type="checkbox" checked={bulkSelected.has(i)}
                                    onChange={() => setBulkSelected(prev => {
                                      const next = new Set(prev);
                                      next.has(i) ? next.delete(i) : next.add(i);
                                      return next;
                                    })}
                                    className="accent-[#00FF66] flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  {item.error ? (
                                    <div className="text-[9px] font-mono text-red-400 uppercase">Failed to extract</div>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-1.5">
                                        <div className="font-bold text-[10px] uppercase tracking-tight truncate">{item.vendor || 'Unknown vendor'}</div>
                                        {item.duplicate && (
                                          <span className="text-[7px] font-mono uppercase font-bold text-orange-400 border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 rounded flex-shrink-0">DUP</span>
                                        )}
                                      </div>
                                      <div className="text-[9px] font-mono text-brand-text-muted mt-0.5">
                                        {item.currency} {item.amount.toLocaleString()} · {item.category}{item.date ? ` · ${item.date}` : ''}
                                      </div>
                                    </>
                                  )}
                                </div>
                                {!item.error && (
                                  <button
                                    onClick={() => {
                                      setBulkEditIndex(i);
                                      setOcrFields({
                                        vendor:         bulkResults[i].vendor,
                                        amount:         String(bulkResults[i].amount),
                                        currency:       bulkResults[i].currency,
                                        date:           bulkResults[i].date ?? '',
                                        category:       bulkResults[i].category,
                                        payment_method: bulkResults[i].payment_method ?? '',
                                        notes:          bulkResults[i].notes ?? '',
                                        account_type:   'Business',
                                      });
                                    }}
                                    className="p-1.5 rounded-lg text-brand-text-muted hover:text-brand-accent hover:bg-brand-accent/10 transition-all flex-shrink-0">
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          {bulkSelected.size > 0 && (
                            <button onClick={handleBulkSave} disabled={bulkSaving}
                              className="w-full py-3 rounded-2xl bg-brand-accent text-black font-bold font-mono text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                              {bulkSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              Save Selected ({bulkSelected.size})
                            </button>
                          )}
                        </div>
                      )}

                      {/* Success */}
                      {bulkSuccess && (
                        <div className="py-10 flex flex-col items-center gap-4">
                          <div className="w-16 h-16 bg-brand-accent/10 rounded-full flex items-center justify-center">
                            <Check className="w-8 h-8 text-brand-accent" />
                          </div>
                          <div className="text-brand-accent font-bold font-mono text-sm uppercase tracking-tight text-center">{bulkSuccess}</div>
                        </div>
                      )}
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Modal — Thermal Receipt */}
      <AnimatePresence>
        {selectedReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setSelectedReceipt(null); setIsEditing(false); }}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />

            {isEditing ? (
              /* ── Edit form panel ── */
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                onClick={e => e.stopPropagation()}
                className="relative glass w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold uppercase tracking-tighter">Edit Receipt</h3>
                  <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-brand-border rounded-xl transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
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
                        {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
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
              </motion.div>
            ) : (
              /* ── Thermal receipt card ── */
              <motion.div
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 60 }}
                onClick={e => e.stopPropagation()}
                className="relative flex flex-col items-center my-auto"
              >
                {/* Card with zigzag edges */}
                <div className="w-72" style={{ filter: 'drop-shadow(0 25px 60px rgba(0,0,0,0.7))' }}>
                  {/* Top zigzag */}
                  <svg viewBox="0 0 288 12" preserveAspectRatio="none" className="w-full h-3 block">
                    <path d="M0,12 L8,0 L16,12 L24,0 L32,12 L40,0 L48,12 L56,0 L64,12 L72,0 L80,12 L88,0 L96,12 L104,0 L112,12 L120,0 L128,12 L136,0 L144,12 L152,0 L160,12 L168,0 L176,12 L184,0 L192,12 L200,0 L208,12 L216,0 L224,12 L232,0 L240,12 L248,0 L256,12 L264,0 L272,12 L280,0 L288,12 L288,12 L0,12 Z" fill="#fffef9" />
                  </svg>

                  {/* Receipt body */}
                  <div className="bg-[#fffef9] px-6 py-5 text-[#1a1a1a]">
                    {/* Header */}
                    <div className="text-center mb-4">
                      <div className="text-xs font-bold tracking-[0.35em] uppercase text-[#1a1a1a]">TRADEXPARTS</div>
                      <div className="text-[8px] tracking-widest text-[#888] uppercase mt-0.5">OFFICIAL RECEIPT</div>
                      <div className="border-b border-dashed border-[#ccc] mt-3" />
                    </div>

                    {/* Date + ID */}
                    <div className="flex justify-between text-[8px] font-mono text-[#999] uppercase mb-4">
                      <span>{selectedReceipt.date || '—'}</span>
                      <span className="text-right">#{selectedReceipt.id.slice(0, 8).toUpperCase()}</span>
                    </div>

                    {/* Vendor */}
                    <div className="text-center mb-1">
                      <div className="text-xl font-bold uppercase tracking-tight text-[#1a1a1a] leading-tight">{selectedReceipt.vendor || '—'}</div>
                    </div>
                    <div className="flex justify-center mb-4">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[8px] font-mono uppercase tracking-widest border border-[#00bb44]/40 text-[#00aa44] bg-[#00cc55]/5">
                        {selectedReceipt.category}
                      </span>
                    </div>

                    <div className="border-b border-dashed border-[#ccc] mb-3" />

                    {/* Line items header */}
                    <div className="flex justify-between text-[8px] font-mono uppercase text-[#aaa] mb-1.5">
                      <span>DESCRIPTION</span>
                      <span>AMOUNT</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-[#1a1a1a] mb-3">
                      <span>Receipt Total</span>
                      <span>{selectedReceipt.currency || 'TZS'} {selectedReceipt.amount.toLocaleString()}</span>
                    </div>
                    {isForeignCurrency(selectedReceipt.currency) && (
                      <div className="flex justify-between text-[9px] font-mono text-[#888] mb-3">
                        <span>TZS Equivalent</span>
                        <span>TSh {toTZS(selectedReceipt.amount, selectedReceipt.currency).toLocaleString()}</span>
                      </div>
                    )}

                    <div className="border-b border-dashed border-[#ccc] mb-3" />

                    {/* Total */}
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-mono font-bold uppercase text-[#1a1a1a]">TOTAL</span>
                      <span className="text-base font-bold font-mono text-[#1a1a1a]">{selectedReceipt.currency || 'TZS'} {selectedReceipt.amount.toLocaleString()}</span>
                    </div>
                    {isForeignCurrency(selectedReceipt.currency) && (
                      <div className="flex justify-end mb-4">
                        <span className="text-[9px] font-mono text-[#888]">≈ TSh {toTZS(selectedReceipt.amount, selectedReceipt.currency).toLocaleString()}</span>
                      </div>
                    )}
                    {!isForeignCurrency(selectedReceipt.currency) && <div className="mb-4" />}

                    {/* Badges */}
                    <div className="flex gap-2 justify-center flex-wrap mb-4">
                      {selectedReceipt.payment_method && (
                        <span className="px-2 py-0.5 rounded text-[8px] font-mono uppercase bg-[#f0f0f0] text-[#666] border border-[#ddd]">
                          {selectedReceipt.payment_method}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[8px] font-mono uppercase border ${
                        selectedReceipt.account_type === 'Business'
                          ? 'bg-[#e8f5e9] text-[#2e7d32] border-[#a5d6a7]'
                          : selectedReceipt.account_type === 'Personal'
                          ? 'bg-[#e3f2fd] text-[#1565c0] border-[#90caf9]'
                          : 'bg-[#f5f5f5] text-[#757575] border-[#e0e0e0]'
                      }`}>
                        {selectedReceipt.account_type}
                      </span>
                    </div>

                    {/* Notes */}
                    {selectedReceipt.notes && (
                      <div className="text-[8px] text-[#999] italic text-center mb-4 leading-relaxed px-2">
                        "{selectedReceipt.notes}"
                      </div>
                    )}

                    <div className="border-b border-dashed border-[#ccc] mb-4" />

                    {/* Footer */}
                    <div className="text-center mb-4">
                      <div className="text-[8px] font-mono text-[#aaa] uppercase tracking-widest">Thank you for your business</div>
                      {selectedReceipt.submitted_by && (
                        <div className="text-[7px] font-mono text-[#ccc] mt-1">Submitted by {selectedReceipt.submitted_by}</div>
                      )}
                    </div>

                    {/* QR placeholder */}
                    <div className="flex justify-center mb-4">
                      <div className="w-14 h-14 bg-[#e8e8e8] rounded-sm flex items-center justify-center">
                        <span className="text-[6px] font-mono text-[#aaa] uppercase tracking-widest">QR</span>
                      </div>
                    </div>

                    {/* Status stamp */}
                    <div className="flex justify-center">
                      <div className={`px-4 py-1 border-2 font-bold text-[10px] tracking-[0.2em] uppercase -rotate-6 ${
                        selectedReceipt.status === 'pending'
                          ? 'border-orange-400 text-orange-400'
                          : 'border-green-600 text-green-600'
                      }`}>
                        {selectedReceipt.status === 'pending' ? 'PENDING' : 'VERIFIED'}
                      </div>
                    </div>
                  </div>

                  {/* Bottom zigzag */}
                  <svg viewBox="0 0 288 12" preserveAspectRatio="none" className="w-full h-3 block">
                    <path d="M0,0 L8,12 L16,0 L24,12 L32,0 L40,12 L48,0 L56,12 L64,0 L72,12 L80,0 L88,12 L96,0 L104,12 L112,0 L120,12 L128,0 L136,12 L144,0 L152,12 L160,0 L168,12 L176,0 L184,12 L192,0 L200,12 L208,0 L216,12 L224,0 L232,12 L240,0 L248,12 L256,0 L264,12 L272,0 L280,12 L288,0 L288,0 L0,0 Z" fill="#fffef9" />
                  </svg>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 mt-5">
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
                    className="px-5 py-2.5 rounded-full bg-white/10 text-white border border-white/20 font-mono text-[10px] uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-1.5"
                  >
                    <Pencil className="w-3 h-3" />
                    EDIT
                  </button>
                  <button
                    onClick={() => deleteReceipt(selectedReceipt.id)}
                    className="px-5 py-2.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-mono text-[10px] uppercase tracking-widest hover:bg-red-500/30 transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    DELETE
                  </button>
                  <button
                    onClick={() => { setSelectedReceipt(null); setIsEditing(false); }}
                    className="px-5 py-2.5 rounded-full bg-white/5 text-white/50 border border-white/10 font-mono text-[10px] uppercase tracking-widest hover:bg-white/10 hover:text-white/80 transition-all"
                  >
                    CLOSE
                  </button>
                </div>
              </motion.div>
            )}
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
              else if (currentPage === 'sales') setOpenSaleModal(true);
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
            onClick={() => setCurrentPage('sales')}
            className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all ${currentPage === 'sales' ? 'text-brand-accent' : 'text-brand-text-muted'}`}
          >
            <TrendingUp className="w-5 h-5" />
            <span className="text-[7px] font-mono uppercase tracking-widest">Sales</span>
          </button>
        </div>
      </nav>

      {/* Quick category picker */}
      {quickCategoryId && quickCategoryPos && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={closeQuickCategory} />
          <div
            className="fixed z-[61] bg-[#111111] border border-[#262626] rounded-2xl p-1.5 shadow-2xl min-w-[160px]"
            style={{ top: quickCategoryPos.top, left: quickCategoryPos.left }}
          >
            <div className="px-3 py-1.5 text-[8px] font-mono uppercase tracking-[0.2em] text-[#5a5a5a]">Set Category</div>
            <div className="max-h-64 overflow-y-auto">
              {allCategories.filter(c => c !== 'Other').map(cat => (
                <button
                  key={cat}
                  onClick={() => handleQuickCategory(quickCategoryId, cat)}
                  className="w-full text-left px-3 py-2 rounded-xl text-[11px] font-mono uppercase tracking-wide hover:bg-[#00FF66]/10 hover:text-[#00FF66] transition-all"
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="border-t border-[#262626] mt-1 pt-1">
              <form
                onSubmit={e => {
                  e.preventDefault();
                  const created = handleAddCategory(newCatInput);
                  if (created) handleQuickCategory(quickCategoryId, created);
                  setNewCatInput('');
                }}
                className="flex items-center gap-1 px-2 py-1"
              >
                <input
                  value={newCatInput}
                  onChange={e => setNewCatInput(e.target.value)}
                  placeholder="New category..."
                  className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-white placeholder-[#555] focus:outline-none focus:border-[#00FF66]/50 min-w-0"
                />
                <button
                  type="submit"
                  disabled={!newCatInput.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-[#00FF66] text-black text-[10px] font-bold font-mono disabled:opacity-40 transition-all"
                >
                  Add
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {showExport && (
        <ExportModal
          receiptCount={receipts.length}
          shipmentCount={0}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
