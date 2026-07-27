import React, { useState } from 'react';
import { Loader2, Layers } from 'lucide-react';
import { supabase } from './supabase';

const inputClass =
  'w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder-brand-text-muted focus:outline-none focus:border-brand-accent/50 focus:ring-2 focus:ring-brand-accent/10 transition-all';

const labelClass = 'block text-[9px] font-mono uppercase tracking-[0.2em] text-brand-text-muted mb-1.5';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
    }
    // On success, App.tsx's onAuthStateChange listener picks up the new
    // session automatically and swaps this screen out.
  };

  return (
    <div className="relative w-full max-w-[100vw] overflow-x-hidden min-h-screen bg-brand-bg text-white font-sans flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-brand-accent rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(0,255,102,0.3)] mb-4">
            <Layers className="text-black w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight uppercase">tradexparts</h1>
          <p className="text-[10px] font-mono text-brand-text-muted uppercase tracking-widest mt-1">
            Sign in to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-[10px] font-mono text-red-400 uppercase tracking-widest">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-6 py-3 rounded-xl text-[10px] font-mono uppercase tracking-widest bg-brand-accent text-black font-bold hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40 disabled:scale-100 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
