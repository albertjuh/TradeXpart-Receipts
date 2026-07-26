import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, ArrowRight, Loader2, Check, ChevronDown,
  X, Pencil, Plus, AlertTriangle, Calculator,
  FileText, DollarSign, TrendingUp, Package, CheckSquare,
  Lock, Clock, ThumbsUp, ThumbsDown, Upload, Download,
  Trash2, Eye,
} from 'lucide-react';
import { supabase, uploadFile, deleteFile, listFiles, getFileUrl } from './supabase';
import type { Shipment } from './ShipmentsPage';

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  shipmentId: string;
  onBack: () => void;
};

type CostLine = {
  id: string;
  description: string;
  amountTZS: number;
  amountUSD: number;
  paid: boolean;
  hasReceipt: boolean;
};

// ── Approval milestone types ─────────────────────────────────────────────────
type ApprovalStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'skipped';

type Milestone = {
  key: string;
  label: string;
  status: ApprovalStatus;
  requiresApproval: boolean;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  date?: string;
  notes?: string;
};

// ── Document types ────────────────────────────────────────────────────────────
type DocVersion = {
  path: string;
  filename: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
};

type DocItem = {
  key: string;
  label: string;
  versions: DocVersion[];
};

type TaxInputs = {
  cifUSD: string;
  fobUSD: string;
  exchangeRate: string;
  dutyRate: string;
  exemption: 'none' | 'partial' | 'full';
  partialPct: string;
  quantity: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  draft:      'bg-neutral-800/60 text-neutral-400 border-neutral-700',
  in_transit: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  at_customs: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  cleared:    'bg-purple-500/10 text-purple-400 border-purple-500/30',
  delivered:  'bg-brand-accent/10 text-brand-accent border-brand-accent/30',
  cancelled:  'bg-red-500/10 text-red-400 border-red-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', in_transit: 'In Transit', at_customs: 'At Customs',
  cleared: 'Cleared', delivered: 'Delivered', cancelled: 'Cancelled',
};

// Milestones that require explicit approval before next can proceed
const APPROVAL_GATES = new Set(['m4', 'm9', 'm10', 'm13']);

const DEFAULT_MILESTONES: Milestone[] = [
  { key: 'm1',  label: 'Shipment Created',         status: 'pending', requiresApproval: false },
  { key: 'm2',  label: 'Contract Signed',          status: 'pending', requiresApproval: false },
  { key: 'm3',  label: 'PI Received',              status: 'pending', requiresApproval: false },
  { key: 'm4',  label: 'Payment Made',             status: 'pending', requiresApproval: true  },
  { key: 'm5',  label: 'Production Started',       status: 'pending', requiresApproval: false },
  { key: 'm6',  label: 'Vessel Departed',          status: 'pending', requiresApproval: false },
  { key: 'm7',  label: 'ETA Confirmed',            status: 'pending', requiresApproval: false },
  { key: 'm8',  label: 'Vessel Arrived',           status: 'pending', requiresApproval: false },
  { key: 'm9',  label: 'TRA Assessment Received',  status: 'pending', requiresApproval: true  },
  { key: 'm10', label: 'Taxes Paid',               status: 'pending', requiresApproval: true  },
  { key: 'm11', label: 'Delivery Order Released',  status: 'pending', requiresApproval: false },
  { key: 'm12', label: 'Container Exited Port',    status: 'pending', requiresApproval: false },
  { key: 'm13', label: 'Goods Received at Godown', status: 'pending', requiresApproval: true  },
  { key: 'm14', label: 'Container Returned',       status: 'pending', requiresApproval: false },
  { key: 'm15', label: 'Shipment Closed',          status: 'pending', requiresApproval: false },
];

const DEFAULT_DOCS: DocItem[] = [
  { key: 'contract',   label: 'Purchase Contract',       versions: [] },
  { key: 'proforma',   label: 'Proforma Invoice',        versions: [] },
  { key: 'commercial', label: 'Commercial Invoice',      versions: [] },
  { key: 'packing',    label: 'Packing List',            versions: [] },
  { key: 'bl',         label: 'Bill of Lading',          versions: [] },
  { key: 'origin',     label: 'Certificate of Origin',   versions: [] },
  { key: 'sgs',        label: 'SGS / Inspection Report', versions: [] },
  { key: 'tra',        label: 'TRA Assessment',          versions: [] },
  { key: 'taxpayment', label: 'Tax Payment Receipt',     versions: [] },
  { key: 'delivery',   label: 'Delivery Order',          versions: [] },
  { key: 'icd',        label: 'ICD Invoice',             versions: [] },
  { key: 'wharfage',   label: 'Wharfage Receipt',        versions: [] },
];

const DEFAULT_COSTS: CostLine[] = [
  { id: 'freight',   description: 'Freight Cost',              amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'insurance', description: 'Insurance',                 amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'sgs',       description: 'SGS Inspection',            amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'printing',  description: 'Printing Costs',            amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'port',      description: 'Port Charges / Wharfage',   amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'icd',       description: 'ICD Charges',               amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'transport', description: 'Transport (ICD to Godown)', amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'offload',   description: 'Offloading Labour',         amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'clearing',  description: 'Clearing & Forwarding Fee', amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'agency',    description: 'Agency Fee',                amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
  { id: 'demurrage', description: 'Demurrage',                 amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false },
];

const fmt  = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtBytes = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

// ─── Helper components ────────────────────────────────────────────────────────

function SectionHeader({ title, icon, open, onToggle }: {
  title: string; icon: React.ReactNode; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-5 py-4 border-b border-brand-border hover:bg-white/[0.02] transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="text-brand-accent">{icon}</span>
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-brand-text-muted">{title}</span>
      </div>
      <ChevronDown className={`w-4 h-4 text-brand-text-muted transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
    </button>
  );
}

function TaxLine({ label, formula, value, highlight, accent, muted }: {
  label: string; formula: string; value: string;
  highlight: boolean; accent?: boolean; muted?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between px-4 py-3 rounded-xl border ${
      highlight ? 'bg-brand-accent/5 border-brand-accent/30' : 'bg-black/25 border-brand-border/40'
    }`}>
      <div className="mr-4 min-w-0">
        <div className="text-[9px] font-mono text-brand-text-muted uppercase tracking-widest">{label}</div>
        <div className="text-[8px] font-mono text-brand-border mt-0.5 break-words">{formula}</div>
      </div>
      <div className={`text-sm font-bold font-mono flex-shrink-0 ${
        muted ? 'text-brand-text-muted' : accent ? 'text-brand-accent' : highlight ? 'text-brand-accent' : 'text-white'
      }`}>{value}</div>
    </div>
  );
}

// ── Approval badge ────────────────────────────────────────────────────────────
function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const map: Record<ApprovalStatus, { cls: string; label: string }> = {
    pending:   { cls: 'bg-neutral-800/60 text-neutral-400 border-neutral-700', label: 'Pending' },
    in_review: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30',   label: 'In Review' },
    approved:  { cls: 'bg-brand-accent/10 text-brand-accent border-brand-accent/30', label: 'Approved' },
    rejected:  { cls: 'bg-red-500/10 text-red-400 border-red-500/30',          label: 'Rejected' },
    skipped:   { cls: 'bg-neutral-800/40 text-neutral-600 border-neutral-800', label: 'Skipped' },
  };
  const { cls, label } = map[status];
  return (
    <span className={`px-2 py-0.5 rounded-md text-[8px] font-mono font-bold uppercase border ${cls}`}>{label}</span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ShipmentDetailPage({ shipmentId, onBack }: Props) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading]   = useState(true);
  const [toast, setToast]       = useState<string | null>(null);
  const [loaded, setLoaded]     = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [deleting, setDeleting] = useState(false);

  const [open, setOpen] = useState<Set<string>>(new Set(['details', 'tax']));
  const toggle = (k: string) =>
    setOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // Cost tracker
  const [costs, setCosts]             = useState<CostLine[]>(DEFAULT_COSTS);
  const [newCostDesc, setNewCostDesc] = useState('');

  // Documents
  const [docs, setDocs]                   = useState<DocItem[]>(DEFAULT_DOCS);
  const [extraDocs, setExtraDocs]         = useState<DocItem[]>([]);
  const [uploadingKey, setUploadingKey]   = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [newDocLabel, setNewDocLabel]     = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocKey, setPendingDocKey] = useState<string | null>(null);

  // Milestones
  const [milestones, setMilestones]             = useState<Milestone[]>(DEFAULT_MILESTONES);
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);
  const [rejectReason, setRejectReason]         = useState('');
  const [approverName, setApproverName]         = useState('');

  // Tax
  const [tax, setTax] = useState<TaxInputs>({
    cifUSD: '', fobUSD: '', exchangeRate: '', dutyRate: '',
    exemption: 'none', partialPct: '50', quantity: '',
  });

  // Profitability
  const [sellingPrice, setSellingPrice] = useState('');

  // Current user name (from Supabase auth)
  const [currentUser, setCurrentUser] = useState('You');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata?.full_name ?? data.user?.email ?? 'You';
      setCurrentUser(name as string);
    });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => {
    supabase.from('shipments').select('*').eq('id', shipmentId).single()
      .then(({ data, error }) => {
        if (!error && data) {
          const row = data as Shipment;
          setShipment(row);
          const rowCosts = row.costs as CostLine[] | undefined;
          const rowMilestones = row.milestones as Milestone[] | undefined;
          const rowDocs = row.docs as DocItem[] | undefined;
          const rowExtraDocs = row.extra_docs as DocItem[] | undefined;
          const rowTax = row.tax_inputs as TaxInputs | undefined;
          setCosts(Array.isArray(rowCosts) && rowCosts.length ? rowCosts : DEFAULT_COSTS);
          setMilestones(Array.isArray(rowMilestones) && rowMilestones.length ? rowMilestones : DEFAULT_MILESTONES);
          setDocs(Array.isArray(rowDocs) && rowDocs.length ? rowDocs : DEFAULT_DOCS);
          setExtraDocs(Array.isArray(rowExtraDocs) ? rowExtraDocs : []);
          if (rowTax) setTax(rowTax);
          if (row.selling_price != null) setSellingPrice(String(row.selling_price));
        }
        setLoading(false);
        setLoaded(true);
      });
  }, [shipmentId]);

  // ── Autosave (debounced) ────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const { error } = await supabase.from('shipments').update({
        costs,
        milestones,
        docs,
        extra_docs: extraDocs,
        tax_inputs: tax,
        selling_price: sellingPrice || null,
        updated_at: new Date().toISOString(),
      }).eq('id', shipmentId);
      setSaveStatus(error ? 'error' : 'saved');
      if (error) console.error('Shipment autosave FAILED:', error.message);
    }, 800);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costs, milestones, docs, extraDocs, tax, sellingPrice, loaded, shipmentId]);

  // ── Tax calculations ──────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const cifUSD = parseFloat(tax.cifUSD)       || 0;
    const fobUSD = parseFloat(tax.fobUSD)       || 0;
    const rate   = parseFloat(tax.exchangeRate) || 0;
    const dutyPct= parseFloat(tax.dutyRate)     || 0;
    const qty    = parseFloat(tax.quantity)     || 1;

    const cifTZS = cifUSD * rate;
    const fobTZS = fobUSD * rate;

    let importDuty = 0;
    if (tax.exemption === 'none') {
      importDuty = cifTZS * (dutyPct / 100);
    } else if (tax.exemption === 'partial') {
      const exemptFrac = (parseFloat(tax.partialPct) || 0) / 100;
      importDuty = cifTZS * (dutyPct / 100) * (1 - exemptFrac);
    }

    const rdl         = cifTZS * 0.02;
    const cpf         = fobTZS * 0.006;
    const vat         = (cifTZS + importDuty) * 0.18;
    const totalTax    = importDuty + rdl + cpf + vat;
    const totalOps    = costs.reduce((s, c) => s + c.amountTZS, 0);
    const totalLanded = cifTZS + totalTax + totalOps;
    const perUnit     = qty > 1 ? totalLanded / qty : 0;

    const sp           = parseFloat(sellingPrice) || 0;
    const grossMargin  = sp > 0 ? sp - totalLanded : 0;
    const marginPct    = sp > 0 ? (grossMargin / sp) * 100 : 0;

    return { cifUSD, fobUSD, rate, dutyPct, qty, cifTZS, fobTZS, importDuty, rdl, cpf, vat, totalTax, totalOps, totalLanded, perUnit, sp, grossMargin, marginPct };
  }, [tax, costs, sellingPrice]);

  // ── Milestone logic ───────────────────────────────────────────────────────

  // A milestone is locked if the previous one is not yet approved/skipped/done enough
  const isMilestoneLocked = (index: number): boolean => {
    if (index === 0) return false;
    const prev = milestones[index - 1];
    // If previous requires approval, it must be 'approved' or 'skipped'
    if (prev.requiresApproval) return prev.status !== 'approved' && prev.status !== 'skipped';
    // Otherwise just needs to not be pending
    return prev.status === 'pending';
  };

  const markDone = (key: string) => {
    setMilestones(prev => prev.map(m =>
      m.key !== key ? m : {
        ...m,
        status: m.requiresApproval ? 'in_review' : 'approved',
        submittedBy: currentUser,
        submittedAt: new Date().toISOString(),
        date: m.date || new Date().toISOString().split('T')[0],
        approvedBy: m.requiresApproval ? undefined : currentUser,
        approvedAt: m.requiresApproval ? undefined : new Date().toISOString(),
      }
    ));
  };

  const approveMilestone = (key: string) => {
    const name = approverName.trim() || currentUser;
    setMilestones(prev => prev.map(m =>
      m.key !== key ? m : { ...m, status: 'approved', approvedBy: name, approvedAt: new Date().toISOString() }
    ));
    setApproverName('');
    setEditingMilestone(null);
    showToast('Milestone approved');
  };

  const rejectMilestone = (key: string) => {
    if (!rejectReason.trim()) { showToast('Please enter a rejection reason'); return; }
    const name = approverName.trim() || currentUser;
    setMilestones(prev => prev.map(m =>
      m.key !== key ? m : { ...m, status: 'rejected', approvedBy: name, approvedAt: new Date().toISOString(), rejectionReason: rejectReason.trim() }
    ));
    setRejectReason('');
    setApproverName('');
    setEditingMilestone(null);
    showToast('Milestone rejected');
  };

  const resubmitMilestone = (key: string) => {
    setMilestones(prev => prev.map(m =>
      m.key !== key ? m : {
        ...m, status: 'in_review', rejectionReason: undefined,
        submittedBy: currentUser, submittedAt: new Date().toISOString(),
      }
    ));
    showToast('Resubmitted for approval');
  };

  const skipMilestone = (key: string) => {
    setMilestones(prev => prev.map(m =>
      m.key !== key ? m : { ...m, status: 'skipped' }
    ));
  };

  const updateMilestone = (key: string, field: 'date' | 'notes', value: string) =>
    setMilestones(prev => prev.map(m => m.key === key ? { ...m, [field]: value } : m));

  // ── Cost helpers ──────────────────────────────────────────────────────────
  const updateCost = (id: string, field: keyof CostLine, value: string | number | boolean) =>
    setCosts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));

  const addCost = () => {
    if (!newCostDesc.trim()) return;
    setCosts(prev => [...prev, {
      id: Date.now().toString(), description: newCostDesc.trim(),
      amountTZS: 0, amountUSD: 0, paid: false, hasReceipt: false,
    }]);
    setNewCostDesc('');
  };

  // ── Document helpers ──────────────────────────────────────────────────────
  const BUCKET = 'documents';

  const handleUpload = async (docKey: string, file: File) => {
    setUploadingKey(docKey);
    setUploadProgress(p => ({ ...p, [docKey]: 0 }));
    try {
      const ts = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `shipments/${shipmentId}/${docKey}/${ts}_${safeName}`;

      // Simulate progress (Supabase JS v2 doesn't expose upload progress)
      const progressInterval = setInterval(() => {
        setUploadProgress(p => ({ ...p, [docKey]: Math.min((p[docKey] || 0) + 20, 90) }));
      }, 150);

      await uploadFile(BUCKET, path, file);
      clearInterval(progressInterval);
      setUploadProgress(p => ({ ...p, [docKey]: 100 }));

      const version: DocVersion = {
        path,
        filename: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser,
      };

      const updateList = (list: DocItem[]) =>
        list.map(d => d.key === docKey ? { ...d, versions: [version, ...d.versions] } : d);

      setDocs(prev => updateList(prev));
      setExtraDocs(prev => updateList(prev));
      showToast(`Uploaded: ${file.name}`);
    } catch (err) {
      console.error('Upload error', err);
      showToast('Upload failed — check Supabase Storage bucket permissions');
    } finally {
      setUploadingKey(null);
      setTimeout(() => setUploadProgress(p => { const n = { ...p }; delete n[docKey]; return n; }), 1200);
    }
  };

  const handleDownload = async (version: DocVersion) => {
    try {
      const url = getFileUrl(BUCKET, version.path);
      const a = document.createElement('a');
      a.href = url;
      a.download = version.filename;
      a.target = '_blank';
      a.click();
    } catch (err) {
      showToast('Download failed');
    }
  };

  const handleDeleteVersion = async (docKey: string, version: DocVersion, isExtra: boolean) => {
    if (!confirm(`Delete "${version.filename}"?`)) return;
    try {
      await deleteFile(BUCKET, version.path);
      const updateList = (list: DocItem[]) =>
        list.map(d => d.key === docKey ? { ...d, versions: d.versions.filter(v => v.path !== version.path) } : d);
      if (isExtra) setExtraDocs(prev => updateList(prev));
      else setDocs(prev => updateList(prev));
      showToast('File deleted');
    } catch (err) {
      showToast('Delete failed');
    }
  };

  const deleteShipment = async () => {
    if (!confirm('Are you sure you want to delete this shipment? This will also delete all uploaded documents.')) return;
    setDeleting(true);
    try {
      const paths = [...docs, ...extraDocs].flatMap(d => d.versions.map(v => v.path));
      if (paths.length > 0) {
        await supabase.storage.from(BUCKET).remove(paths);
      }
      const { error } = await supabase.from('shipments').delete().eq('id', shipmentId);
      if (error) throw error;
      onBack();
    } catch (err) {
      showToast('Delete failed');
      setDeleting(false);
    }
  };

  const triggerUpload = (key: string) => {
    setPendingDocKey(key);
    fileInputRef.current?.click();
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && pendingDocKey) handleUpload(pendingDocKey, file);
    e.target.value = '';
    setPendingDocKey(null);
  };

  const addExtraDoc = () => {
    if (!newDocLabel.trim()) return;
    const key = `extra_${Date.now()}`;
    setExtraDocs(prev => [...prev, { key, label: newDocLabel.trim(), versions: [] }]);
    setNewDocLabel('');
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const doneCount  = milestones.filter(m => m.status === 'approved' || m.status === 'skipped').length;
  const docsDone   = [...docs, ...extraDocs].filter(d => d.versions.length > 0).length;
  const totalDocs  = docs.length + extraDocs.length;
  const totalOps   = costs.reduce((s, c) => s + c.amountTZS, 0);

  const inputCls = 'w-full bg-black/30 border border-brand-border rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand-accent/50 transition-all';
  const labelCls = 'block text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5';

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 text-brand-accent animate-spin" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="w-full max-w-4xl mx-auto px-6 pt-10 pb-28 md:pb-10">
        <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-brand-text-muted hover:text-brand-accent transition-colors mb-8">
          <ArrowLeft className="w-3.5 h-3.5" /> Shipments
        </button>
        <p className="text-brand-text-muted font-mono text-sm">Shipment not found.</p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 pt-8 pb-28 md:pb-10 overflow-x-hidden box-border space-y-4">

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" className="hidden"
        accept="image/*,.pdf,.xlsx,.docx,.xls,.doc" onChange={onFileSelected} />

      {/* Back */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-brand-text-muted hover:text-brand-accent transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Shipments
        </button>
        <div className="flex items-center gap-4">
          <span className={`text-[9px] font-mono uppercase tracking-widest ${
            saveStatus === 'error' ? 'text-red-400' : 'text-brand-text-muted'
          }`}>
            {saveStatus === 'saving' && 'Saving…'}
            {saveStatus === 'saved' && 'All changes saved'}
            {saveStatus === 'error' && 'Save failed — check connection'}
          </span>
          <button
            onClick={deleteShipment}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-all disabled:opacity-40"
          >
            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Delete Shipment
          </button>
        </div>
      </div>

      {/* ── Summary card ─────────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-5 md:p-7 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-accent/40 to-transparent" />
        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`px-3 py-1 rounded-lg text-[9px] font-mono font-bold uppercase border ${
            shipment.type === 'import' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-brand-accent/10 text-brand-accent border-brand-accent/30'
          }`}>{shipment.type}</span>
          <span className={`px-3 py-1 rounded-lg text-[9px] font-mono font-bold uppercase border ${STATUS_BADGE[shipment.status] ?? STATUS_BADGE.draft}`}>
            {STATUS_LABELS[shipment.status] ?? shipment.status}
          </span>
          {shipment.year && (
            <span className="px-3 py-1 rounded-lg text-[9px] font-mono font-bold uppercase border border-brand-border text-brand-text-muted">
              {shipment.year}
            </span>
          )}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-tighter leading-none mb-2">
          {shipment.commodity ?? 'Unknown Commodity'}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-brand-text-muted mb-6">
          <span>{shipment.origin_country ?? '?'}</span>
          <ArrowRight className="w-3 h-3 text-brand-accent flex-shrink-0" />
          <span>{shipment.destination_country ?? '?'}</span>
          {shipment.supplier && <><span className="text-brand-border">·</span><span>{shipment.supplier}</span></>}
          {shipment.buyer    && <><span className="text-brand-border">·</span><span>{shipment.buyer}</span></>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'CIF Value (TZS)',   value: calc.cifTZS   > 0 ? `TSh ${fmt(calc.cifTZS)}`  : '—' },
            { label: 'Total Tax Est.',    value: calc.totalTax > 0 ? `TSh ${fmt(calc.totalTax)}` : '—' },
            { label: 'Operational Costs', value: totalOps      > 0 ? `TSh ${fmt(totalOps)}`      : '—' },
            { label: 'Milestones',        value: `${doneCount} / ${milestones.length}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-black/30 rounded-xl px-3 py-3 border border-brand-border/40">
              <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1">{label}</div>
              <div className="text-sm font-bold font-mono text-white">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 1. Shipment Details ───────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader title="Shipment Details" icon={<Package className="w-4 h-4" />} open={open.has('details')} onToggle={() => toggle('details')} />
        {open.has('details') && (
          <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
            {([
              ['B/L Number', shipment.bl_number], ['Container #', shipment.container_number],
              ['Container Type', shipment.container_type], ['HS Code', shipment.hs_code],
              ['Product Type', shipment.product_type], ['Year', shipment.year],
            ] as [string, string | number | null][]).map(([label, value]) => (
              <div key={label} className="bg-black/25 rounded-xl px-4 py-3 border border-brand-border/40">
                <div className={labelCls}>{label}</div>
                <div className="text-sm font-mono text-white">{value ?? '—'}</div>
              </div>
            ))}
            {shipment.notes && (
              <div className="col-span-2 md:col-span-3 bg-black/25 rounded-xl px-4 py-3 border border-brand-border/40">
                <div className={labelCls}>Notes</div>
                <div className="text-xs font-mono text-brand-text-muted leading-relaxed">{shipment.notes}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 2. TRA Tax Calculator ─────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader title="TRA Tax Calculator" icon={<Calculator className="w-4 h-4" />} open={open.has('tax')} onToggle={() => toggle('tax')} />
        {open.has('tax') && (
          <div className="p-5 space-y-5">
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[9px] font-mono text-amber-400 leading-relaxed">
                DISCLAIMER: These are estimates only. Actual TRA assessment may differ based on HS classification, granted exemptions, and prevailing rates. Always verify with your licensed clearing agent.
              </p>
            </div>
            <div>
              <p className={`${labelCls} mb-3`}>Inputs</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><label className={labelCls}>CIF Value (USD)</label>
                  <input type="number" min="0" placeholder="0.00" value={tax.cifUSD} onChange={e => setTax(p => ({ ...p, cifUSD: e.target.value }))} className={inputCls} />
                </div>
                <div><label className={labelCls}>FOB Value (USD)</label>
                  <input type="number" min="0" placeholder="0.00" value={tax.fobUSD} onChange={e => setTax(p => ({ ...p, fobUSD: e.target.value }))} className={inputCls} />
                </div>
                <div><label className={labelCls}>USD → TZS Rate</label>
                  <input type="number" min="0" placeholder="e.g. 2600" value={tax.exchangeRate} onChange={e => setTax(p => ({ ...p, exchangeRate: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Import Duty Rate %</label>
                  <input type="number" min="0" max="100" placeholder="0 / 10 / 25" value={tax.dutyRate} onChange={e => setTax(p => ({ ...p, dutyRate: e.target.value }))} className={inputCls} />
                  <p className="text-[8px] font-mono text-brand-text-muted mt-1">EAC CET: 0%, 10%, or 25%</p>
                </div>
                <div>
                  <label className={labelCls}>Exemption</label>
                  <select value={tax.exemption} onChange={e => setTax(p => ({ ...p, exemption: e.target.value as TaxInputs['exemption'] }))} className={inputCls}>
                    <option value="none">None</option>
                    <option value="partial">Partial</option>
                    <option value="full">Full</option>
                  </select>
                </div>
                {tax.exemption === 'partial' && (
                  <div><label className={labelCls}>Exemption Reduction %</label>
                    <input type="number" min="0" max="100" placeholder="50" value={tax.partialPct} onChange={e => setTax(p => ({ ...p, partialPct: e.target.value }))} className={inputCls} />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Quantity (units)</label>
                  <input type="number" min="1" placeholder="1" value={tax.quantity} onChange={e => setTax(p => ({ ...p, quantity: e.target.value }))} className={inputCls} />
                  <p className="text-[8px] font-mono text-brand-text-muted mt-1">For cost-per-unit calculation</p>
                </div>
              </div>
            </div>
            {calc.cifTZS > 0 && (
              <div>
                <p className={`${labelCls} mb-3`}>Calculated Taxes</p>
                <div className="space-y-2">
                  <TaxLine label="CIF Value (TZS)" formula={`${fmtD(calc.cifUSD)} × ${fmt(calc.rate)} = TSh ${fmt(calc.cifTZS)}`} value={`TSh ${fmt(calc.cifTZS)}`} highlight={false} />
                  <TaxLine
                    label={`Import Duty${tax.exemption !== 'none' ? ` (${tax.exemption} exemption)` : ''}`}
                    formula={tax.exemption === 'full' ? 'Full exemption applied — TSh 0' : tax.exemption === 'partial' ? `TSh ${fmt(calc.cifTZS)} × ${calc.dutyPct}% × ${100 - parseFloat(tax.partialPct || '0')}% effective` : `TSh ${fmt(calc.cifTZS)} × ${calc.dutyPct}%`}
                    value={`TSh ${fmt(calc.importDuty)}`} highlight={false} accent={calc.importDuty === 0}
                  />
                  <TaxLine label="RDL — Railway Development Levy" formula={`TSh ${fmt(calc.cifTZS)} × 2%`} value={`TSh ${fmt(calc.rdl)}`} highlight={false} />
                  <TaxLine label="CPF — Customs Processing Fee" formula={calc.fobTZS > 0 ? `FOB TSh ${fmt(calc.fobTZS)} × 0.6%` : 'Enter FOB value to calculate'} value={`TSh ${fmt(calc.cpf)}`} highlight={false} muted={calc.fobTZS === 0} />
                  <TaxLine label="VAT (18%)" formula={`(CIF TSh ${fmt(calc.cifTZS)} + Duty TSh ${fmt(calc.importDuty)}) × 18%`} value={`TSh ${fmt(calc.vat)}`} highlight={false} />
                  <div className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-brand-accent/5 border border-brand-accent/30">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-accent">Total Tax Estimate</div>
                    <div className="text-lg font-bold font-mono text-brand-accent">TSh {fmt(calc.totalTax)}</div>
                  </div>
                  <div className="flex items-start justify-between px-4 py-3.5 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-white">Total Landed Cost</div>
                      <div className="text-[8px] font-mono text-brand-text-muted mt-0.5">CIF TSh {fmt(calc.cifTZS)} + Tax TSh {fmt(calc.totalTax)} + Ops TSh {fmt(calc.totalOps)}</div>
                    </div>
                    <div className="text-lg font-bold font-mono text-white ml-4">TSh {fmt(calc.totalLanded)}</div>
                  </div>
                  {calc.qty > 1 && <TaxLine label={`Cost Per Unit (÷ ${fmt(calc.qty)} units)`} formula={`TSh ${fmt(calc.totalLanded)} ÷ ${fmt(calc.qty)}`} value={`TSh ${fmt(calc.perUnit)}`} highlight={false} />}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 3. Cost Tracker ──────────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader title={`Cost Tracker — ${costs.length} lines · TSh ${fmt(totalOps)}`} icon={<DollarSign className="w-4 h-4" />} open={open.has('costs')} onToggle={() => toggle('costs')} />
        {open.has('costs') && (
          <div className="p-4 space-y-2">
            <div className="hidden md:grid grid-cols-[1fr_140px_110px_52px_60px_28px] gap-2 px-3 mb-1">
              {['Description', 'Amount TZS', 'Amount USD', 'Paid', 'Receipt', ''].map(h => (
                <div key={h} className="text-[8px] font-mono uppercase tracking-[0.15em] text-brand-text-muted">{h}</div>
              ))}
            </div>
            {costs.map(c => (
              <div key={c.id} className="grid grid-cols-1 md:grid-cols-[1fr_140px_110px_52px_60px_28px] gap-2 px-3 py-2.5 bg-black/20 rounded-xl border border-brand-border/30">
                <input value={c.description} onChange={e => updateCost(c.id, 'description', e.target.value)}
                  className="bg-transparent text-xs font-mono text-white focus:outline-none border-b border-transparent focus:border-brand-accent/30 transition-all" />
                <input type="number" min="0" placeholder="0" value={c.amountTZS || ''}
                  onChange={e => updateCost(c.id, 'amountTZS', parseFloat(e.target.value) || 0)}
                  className="bg-black/30 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none border border-brand-border/40 focus:border-brand-accent/40 transition-all" />
                <input type="number" min="0" placeholder="0" value={c.amountUSD || ''}
                  onChange={e => updateCost(c.id, 'amountUSD', parseFloat(e.target.value) || 0)}
                  className="bg-black/30 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none border border-brand-border/40 focus:border-brand-accent/40 transition-all" />
                <button onClick={() => updateCost(c.id, 'paid', !c.paid)}
                  className={`rounded-lg py-1.5 text-[9px] font-mono font-bold uppercase border transition-all ${c.paid ? 'bg-brand-accent/10 text-brand-accent border-brand-accent/30' : 'bg-black/20 text-brand-text-muted border-brand-border/40 hover:border-brand-text-muted'}`}>
                  {c.paid ? '✓' : '—'}
                </button>
                <button onClick={() => updateCost(c.id, 'hasReceipt', !c.hasReceipt)}
                  className={`rounded-lg py-1.5 text-[9px] font-mono font-bold uppercase border transition-all ${c.hasReceipt ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-black/20 text-brand-text-muted border-brand-border/40 hover:border-brand-text-muted'}`}>
                  {c.hasReceipt ? '✓ Doc' : '—'}
                </button>
                <button onClick={() => setCosts(prev => prev.filter(x => x.id !== c.id))}
                  className="flex items-center justify-center text-brand-text-muted hover:text-red-400 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-brand-accent/5 border border-brand-accent/20 mt-1">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-accent">Total Operational Costs</span>
                <span className="text-[8px] font-mono text-brand-text-muted ml-3">{costs.filter(c => c.paid).length}/{costs.length} paid</span>
              </div>
              <span className="text-sm font-bold font-mono text-brand-accent">TSh {fmt(totalOps)}</span>
            </div>
            <div className="flex gap-2 mt-2">
              <input type="text" placeholder="Add cost line description..." value={newCostDesc} onChange={e => setNewCostDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCost()} className={`${inputCls} flex-1`} />
              <button onClick={addCost} className="px-4 py-2 rounded-lg bg-brand-accent/10 text-brand-accent border border-brand-accent/30 hover:bg-brand-accent/20 transition-all text-xs font-mono font-bold flex items-center gap-1.5 flex-shrink-0">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. Document Checklist ─────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader title={`Document Checklist — ${docsDone} / ${totalDocs} uploaded`} icon={<FileText className="w-4 h-4" />} open={open.has('docs')} onToggle={() => toggle('docs')} />
        {open.has('docs') && (
          <div className="p-4 space-y-3">
            {[...docs.map(d => ({ ...d, isExtra: false })), ...extraDocs.map(d => ({ ...d, isExtra: true }))].map(doc => {
              const latest = doc.versions[0];
              const isUploading = uploadingKey === doc.key;
              const progress = uploadProgress[doc.key] ?? 0;
              return (
                <div key={doc.key} className={`rounded-xl border p-3 transition-all ${latest ? 'bg-brand-accent/5 border-brand-accent/20' : 'bg-black/20 border-brand-border/30'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border ${latest ? 'bg-brand-accent border-brand-accent' : 'bg-transparent border-brand-border'}`}>
                        {latest && <Check className="w-3 h-3 text-black" />}
                      </div>
                      <div className="min-w-0">
                        <div className={`text-[10px] font-mono font-bold uppercase truncate ${latest ? 'text-brand-accent' : 'text-brand-text-muted'}`}>{doc.label}</div>
                        {latest && (
                          <div className="text-[8px] font-mono text-brand-text-muted mt-0.5">
                            {latest.filename} · {fmtBytes(latest.size)} · {latest.uploadedAt.slice(0, 10)} · {latest.uploadedBy}
                            {doc.versions.length > 1 && <span className="ml-1 text-brand-accent">v{doc.versions.length}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {latest && (
                        <>
                          <button onClick={() => handleDownload(latest)} className="p-1.5 rounded-lg border border-brand-border/40 text-brand-text-muted hover:text-brand-accent hover:border-brand-accent/40 transition-all" title="Download">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteVersion(doc.key, latest, doc.isExtra)} className="p-1.5 rounded-lg border border-brand-border/40 text-brand-text-muted hover:text-red-400 hover:border-red-500/30 transition-all" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => triggerUpload(doc.key)}
                        disabled={isUploading}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase border transition-all ${isUploading ? 'opacity-50 cursor-not-allowed border-brand-border/40 text-brand-text-muted' : latest ? 'border-brand-accent/30 text-brand-accent hover:bg-brand-accent/10' : 'border-brand-border text-brand-text-muted hover:border-brand-accent/40 hover:text-brand-accent'}`}
                      >
                        {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {isUploading ? 'Uploading...' : latest ? 'Re-upload' : 'Upload'}
                      </button>
                    </div>
                  </div>
                  {isUploading && (
                    <div className="mt-2 h-1 bg-brand-border/40 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-accent transition-all duration-200 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                  {/* Older versions */}
                  {doc.versions.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-brand-border/20 space-y-1">
                      <div className="text-[8px] font-mono text-brand-text-muted uppercase tracking-widest">Previous Versions</div>
                      {doc.versions.slice(1).map(v => (
                        <div key={v.path} className="flex items-center justify-between">
                          <div className="text-[8px] font-mono text-brand-text-muted truncate">{v.filename} · {v.uploadedAt.slice(0, 10)}</div>
                          <div className="flex gap-1">
                            <button onClick={() => handleDownload(v)} className="p-1 text-brand-text-muted hover:text-brand-accent transition-colors"><Download className="w-3 h-3" /></button>
                            <button onClick={() => handleDeleteVersion(doc.key, v, doc.isExtra)} className="p-1 text-brand-text-muted hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add extra document */}
            <div className="pt-2 border-t border-brand-border/20">
              <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-2">Additional Documents</p>
              <div className="flex gap-2">
                <input type="text" placeholder="Document label..." value={newDocLabel} onChange={e => setNewDocLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExtraDoc()} className={`${inputCls} flex-1`} />
                <button onClick={addExtraDoc} className="px-3 py-2 rounded-lg bg-brand-accent/10 text-brand-accent border border-brand-accent/30 hover:bg-brand-accent/20 transition-all text-xs font-mono font-bold flex items-center gap-1.5 flex-shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 5. Milestones Timeline ────────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader title={`Milestones — ${doneCount} / ${milestones.length} completed`} icon={<CheckSquare className="w-4 h-4" />} open={open.has('milestones')} onToggle={() => toggle('milestones')} />
        {open.has('milestones') && (
          <div className="p-4">
            <p className="text-[8px] font-mono text-brand-text-muted uppercase tracking-widest mb-4 px-1">
              Complete each milestone in sequence. Approval gates (🔒) require sign-off before the next milestone unlocks.
            </p>
            <div className="space-y-0">
              {milestones.map((m, i) => {
                const locked = isMilestoneLocked(i);
                const isEditingThis = editingMilestone === m.key;
                const isLast = i === milestones.length - 1;

                return (
                  <div key={m.key} className="flex items-start gap-3">
                    {/* Timeline dot + connector */}
                    <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                        locked ? 'bg-transparent border-brand-border/30'
                        : m.status === 'approved'  ? 'bg-brand-accent/20 border-brand-accent shadow-[0_0_10px_rgba(0,255,102,0.25)]'
                        : m.status === 'in_review'  ? 'bg-amber-500/20 border-amber-500'
                        : m.status === 'rejected'   ? 'bg-red-500/20 border-red-500'
                        : m.status === 'skipped'    ? 'bg-neutral-800/60 border-neutral-700'
                        : 'bg-transparent border-brand-border hover:border-brand-accent/40'
                      }`}>
                        {locked          ? <Lock className="w-3 h-3 text-brand-border/50" />
                        : m.status === 'approved'  ? <Check className="w-3 h-3 text-brand-accent" />
                        : m.status === 'in_review'  ? <Clock className="w-3 h-3 text-amber-400" />
                        : m.status === 'rejected'   ? <X className="w-3 h-3 text-red-400" />
                        : m.status === 'skipped'    ? <X className="w-3 h-3 text-neutral-500" />
                        : null}
                      </div>
                      {!isLast && (
                        <div className={`w-px flex-1 min-h-[24px] my-1 ${
                          m.status === 'approved' ? 'bg-brand-accent/30' : 'bg-brand-border'
                        }`} />
                      )}
                    </div>

                    {/* Milestone content */}
                    <div className={`flex-1 pb-4 ${locked ? 'opacity-40 pointer-events-none' : ''}`}>
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <span className={`text-[10px] font-mono uppercase tracking-widest ${
                          m.status === 'approved'  ? 'text-brand-accent font-bold'
                          : m.status === 'in_review'  ? 'text-amber-400 font-bold'
                          : m.status === 'rejected'   ? 'text-red-400 font-bold'
                          : m.status === 'skipped'    ? 'text-neutral-600 line-through'
                          : 'text-brand-text-muted'
                        }`}>{m.label}</span>

                        {m.requiresApproval && !locked && (
                          <span className="text-[7px] font-mono uppercase tracking-widest text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded">Approval Gate</span>
                        )}
                        <ApprovalBadge status={m.status} />
                        {m.date && m.status === 'approved' && (
                          <span className="text-[8px] font-mono text-brand-text-muted">{m.date}</span>
                        )}
                      </div>

                      {/* Approval chain info */}
                      {(m.submittedBy || m.approvedBy) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[8px] font-mono text-brand-text-muted mb-1">
                          {m.submittedBy && <span>Submitted by {m.submittedBy}{m.submittedAt ? ` · ${m.submittedAt.slice(0, 10)}` : ''}</span>}
                          {m.approvedBy && m.status === 'approved' && <span className="text-brand-accent">Approved by {m.approvedBy}{m.approvedAt ? ` · ${m.approvedAt.slice(0, 10)}` : ''}</span>}
                          {m.approvedBy && m.status === 'rejected' && <span className="text-red-400">Rejected by {m.approvedBy}</span>}
                        </div>
                      )}

                      {m.rejectionReason && (
                        <div className="mt-1 text-[8px] font-mono text-red-400/80 italic">Reason: {m.rejectionReason}</div>
                      )}

                      {m.notes && !isEditingThis && (
                        <div className="text-[8px] font-mono text-brand-text-muted italic">{m.notes}</div>
                      )}

                      {/* Actions */}
                      {!locked && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {/* Not yet submitted */}
                          {(m.status === 'pending') && (
                            <>
                              <button onClick={() => markDone(m.key)}
                                className="px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase border bg-brand-accent/10 text-brand-accent border-brand-accent/30 hover:bg-brand-accent/20 transition-all flex items-center gap-1.5">
                                <Check className="w-3 h-3" /> Mark Done
                              </button>
                              <button onClick={() => skipMilestone(m.key)}
                                className="px-3 py-1.5 rounded-lg text-[9px] font-mono uppercase border border-brand-border/40 text-brand-text-muted hover:border-brand-text-muted transition-all">
                                Skip
                              </button>
                            </>
                          )}

                          {/* In review — approver panel */}
                          {m.status === 'in_review' && (
                            <div className="w-full mt-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <input type="text" placeholder="Approver name (optional)" value={isEditingThis ? approverName : ''}
                                  onChange={e => setApproverName(e.target.value)}
                                  onFocus={() => setEditingMilestone(m.key)}
                                  className="flex-1 bg-black/30 border border-brand-border/40 rounded-lg px-2 py-1 text-[9px] font-mono text-white focus:outline-none focus:border-brand-accent/40 placeholder:text-brand-text-muted/50" />
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => { setEditingMilestone(m.key); approveMilestone(m.key); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase border bg-brand-accent/10 text-brand-accent border-brand-accent/30 hover:bg-brand-accent/20 transition-all">
                                  <ThumbsUp className="w-3 h-3" /> Approve
                                </button>
                                <button onClick={() => setEditingMilestone(isEditingThis ? null : m.key)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase border bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 transition-all">
                                  <ThumbsDown className="w-3 h-3" /> Reject
                                </button>
                              </div>
                              {isEditingThis && (
                                <div className="flex gap-2">
                                  <input type="text" placeholder="Rejection reason (required)" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                                    className="flex-1 bg-black/30 border border-red-500/30 rounded-lg px-2 py-1 text-[9px] font-mono text-white focus:outline-none" />
                                  <button onClick={() => rejectMilestone(m.key)}
                                    className="px-3 py-1 rounded-lg text-[9px] font-mono font-bold uppercase bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all">
                                    Confirm
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Rejected — resubmit */}
                          {m.status === 'rejected' && (
                            <button onClick={() => resubmitMilestone(m.key)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase border bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20 transition-all">
                              <Pencil className="w-3 h-3" /> Resubmit
                            </button>
                          )}

                          {/* Date / notes edit for approved */}
                          {m.status === 'approved' && (
                            <button onClick={() => setEditingMilestone(isEditingThis ? null : m.key)}
                              className="text-brand-text-muted hover:text-brand-accent transition-colors">
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Date + notes inputs when editing */}
                      {isEditingThis && (m.status === 'approved' || m.status === 'pending') && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <input type="date" value={m.date || ''} onChange={e => updateMilestone(m.key, 'date', e.target.value)}
                            className="bg-black/30 border border-brand-border/40 rounded-lg px-2 py-1 text-[9px] font-mono text-white focus:outline-none focus:border-brand-accent/40" />
                          <input type="text" placeholder="Add notes..." value={m.notes || ''} onChange={e => updateMilestone(m.key, 'notes', e.target.value)}
                            className="flex-1 min-w-[140px] bg-black/30 border border-brand-border/40 rounded-lg px-2 py-1 text-[9px] font-mono text-white focus:outline-none focus:border-brand-accent/40" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── 6. Profitability Summary ──────────────────────────────────────── */}
      <div className="glass rounded-2xl overflow-hidden">
        <SectionHeader title="Profitability Summary" icon={<TrendingUp className="w-4 h-4" />} open={open.has('profit')} onToggle={() => toggle('profit')} />
        {open.has('profit') && (
          <div className="p-5 space-y-4">
            <div>
              <label className={labelCls}>Selling Price / Total Revenue (TZS)</label>
              <input type="number" min="0" placeholder="0" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} className={`${inputCls} md:max-w-xs`} />
            </div>
            <div className="space-y-2">
              {[
                { label: 'CIF Value',           value: calc.cifTZS,     color: 'text-white',     bold: false },
                { label: 'Total Taxes (est.)',   value: calc.totalTax,   color: 'text-red-400',   bold: false },
                { label: 'Operational Costs',    value: calc.totalOps,   color: 'text-amber-400', bold: false },
                { label: 'Total Landed Cost',    value: calc.totalLanded,color: 'text-white',     bold: true  },
              ].map(({ label, value, color, bold }) => (
                <div key={label} className={`flex items-center justify-between px-4 py-3 rounded-xl border border-brand-border/40 bg-black/25 ${bold ? 'border-white/15' : ''}`}>
                  <div className={`text-[10px] font-mono uppercase tracking-widest text-brand-text-muted ${bold ? 'font-bold' : ''}`}>{label}</div>
                  <div className={`text-sm font-bold font-mono ${color}`}>TSh {fmt(value)}</div>
                </div>
              ))}
              {calc.sp > 0 && (
                <>
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-brand-border/40 bg-black/25">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-brand-text-muted">Revenue</div>
                    <div className="text-sm font-bold font-mono text-blue-400">TSh {fmt(calc.sp)}</div>
                  </div>
                  <div className={`flex items-center justify-between px-4 py-3.5 rounded-xl border ${calc.grossMargin >= 0 ? 'bg-brand-accent/5 border-brand-accent/30' : 'bg-red-500/5 border-red-500/30'}`}>
                    <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-text-muted">Gross Margin</div>
                    <div className="text-right">
                      <div className={`text-sm font-bold font-mono ${calc.grossMargin >= 0 ? 'text-brand-accent' : 'text-red-400'}`}>
                        TSh {fmt(Math.abs(calc.grossMargin))}{calc.grossMargin < 0 ? ' (Loss)' : ''}
                      </div>
                      <div className={`text-[9px] font-mono ${calc.grossMargin >= 0 ? 'text-brand-accent/70' : 'text-red-400/70'}`}>{calc.marginPct.toFixed(1)}% margin</div>
                    </div>
                  </div>
                </>
              )}
              {calc.qty > 1 && calc.totalLanded > 0 && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-brand-border/40 bg-black/25">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-brand-text-muted">Cost Per Unit ({fmt(calc.qty)} units)</div>
                  <div className="text-sm font-bold font-mono text-white">TSh {fmt(calc.perUnit)}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-brand-card border border-brand-border text-[10px] font-mono uppercase tracking-widest text-brand-accent shadow-2xl whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
