import React from 'react';
import { motion } from 'motion/react';
import { Layers, ArrowUpRight } from 'lucide-react';
import { supabase } from './supabase';

export default function Login() {
  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  return (
    <div className="min-h-screen bg-brand-bg text-white font-sans flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-16 h-16 bg-brand-accent rounded-2xl flex items-center justify-center shadow-[0_0_40px_rgba(0,255,102,0.3)] mb-5">
            <Layers className="text-black w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight uppercase">tradexparts</h1>
          <span className="text-[10px] font-mono text-brand-accent tracking-widest uppercase mt-1">
            v1.0.0 // AI-POWERED
          </span>
        </div>

        {/* Card */}
        <div className="glass rounded-3xl p-10 border border-brand-border">
          <div className="mb-8 text-center">
            <h2 className="text-xl font-bold uppercase tracking-tighter">Access Portal</h2>
            <p className="text-[11px] font-mono text-brand-text-muted uppercase tracking-widest mt-2">
              Trade Operations Platform
            </p>
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-between gap-3 bg-white text-black px-6 py-4 rounded-2xl font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(255,255,255,0.05)]"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="flex-1 text-center uppercase tracking-widest text-xs">Continue with Google</span>
            <ArrowUpRight className="w-4 h-4 flex-shrink-0" />
          </button>

          <p className="text-center text-[9px] font-mono text-brand-text-muted uppercase tracking-widest mt-8 leading-relaxed">
            Secure authentication via Google OAuth 2.0
          </p>
        </div>

        <p className="text-center text-[9px] font-mono text-brand-text-muted uppercase tracking-widest mt-6">
          &copy; 2025 TradeXparts &mdash; All rights reserved
        </p>
      </motion.div>
    </div>
  );
}
