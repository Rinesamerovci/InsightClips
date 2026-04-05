"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Zap, Mail, Lock, ChevronRight, Info, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /**
   * Leximi i të dhënave kur hapet faqja
   */
  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  /**
   * Logjika e Login
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      setError(error.message === "Invalid login credentials" 
        ? "ACCESS DENIED: INVALID NEURAL ID" 
        : error.message.toUpperCase());
      setLoading(false);
    } else {
      // Menaxhimi i Remember Me pas suksesit
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }
      
      // Refresh dhe dërgim te Dashboard
      window.location.href = "/dashboard";
    }
  };

  return (
    <div className="min-h-screen bg-[#02040a] text-slate-300 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[500px] bg-emerald-500/5 blur-[120px] rounded-full -z-10" />

      <div className="absolute top-10 left-10">
        <Link href="/" className="group flex items-center gap-3 text-emerald-400/50 hover:text-emerald-400 transition-all">
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Back to Home</span>
        </Link>
      </div>

      <div className="w-full max-w-md bg-white/[0.02] border border-white/5 p-12 rounded-[3.5rem] backdrop-blur-3xl shadow-2xl relative">
        
        <div className="flex flex-col items-center mb-12 text-center">
          <div className="w-14 h-14 bg-emerald-400 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-6 transition-transform hover:scale-110 duration-500">
            <Zap size={28} className="text-black" fill="currentColor" />
          </div>
          <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white leading-none">Neural Login</h2>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 mt-3 italic">Verify Your Identity</p>
        </div>

        <form className="space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4">
            
            <div className="relative group">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-400 transition-colors" size={18} />
              <input 
                type="email" 
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="EMAIL ADDRESS" 
                className="w-full bg-black/40 border border-white/5 p-5 pl-14 rounded-2xl outline-none focus:border-emerald-400/30 text-xs font-bold tracking-widest text-emerald-400 transition-all placeholder:text-slate-800" 
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-400 transition-colors" size={18} />
              <input 
                type="password" 
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="PASSWORD" 
                className="w-full bg-black/40 border border-white/5 p-5 pl-14 rounded-2xl outline-none focus:border-emerald-400/30 text-xs font-bold tracking-widest text-white transition-all placeholder:text-slate-800" 
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 py-3 px-4 rounded-xl text-center">
               <p className="text-[9px] font-black uppercase tracking-widest text-red-400">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between px-2">
            <label className="flex items-center gap-2 cursor-pointer group select-none">
              <input 
                type="checkbox" 
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-white/10 bg-black/40 checked:bg-emerald-400 transition-all accent-emerald-400 cursor-pointer" 
              />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 group-hover:text-slate-400 transition-colors">Remember Me</span>
            </label>
            <Link 
              href="/forgot-password" 
              className="text-[9px] font-black uppercase tracking-widest text-emerald-400/60 hover:text-emerald-400 transition-colors"
            >
              Forgot Password?
            </Link>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-400 text-black p-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:shadow-[0_0_30px_rgba(52,211,153,0.3)] transition-all active:scale-95 border-none mt-4 disabled:opacity-50"
          >
            {loading ? (
              <>ESTABLISHING... <Loader2 size={18} className="animate-spin" /></>
            ) : (
              <>Initialize Session <ChevronRight size={18} /></>
            )}
          </button>
        </form>

        <p className="text-center mt-10 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
          NO SYSTEM ACCESS? <Link href="/register" className="text-emerald-400 hover:underline underline-offset-4 ml-1 font-black transition-all">CREATE IDENTITY</Link>
        </p>
      </div>
      
      <div className="absolute bottom-10 opacity-20 text-[8px] font-black uppercase tracking-[0.5em] flex items-center gap-2">
        <Info size={10} /> InsightClips • Security Protocol v3.0
      </div>
    </div>
  );
}