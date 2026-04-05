"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ShieldCheck, Loader2, AlertCircle, CheckCircle2, Lock } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      // Verifikojmë nëse përdoruesi ka një session të vlefshëm nga OTP
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionValid(true);
      } else {
        setSessionValid(false);
      }
    };
    checkSession();
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("PASSWORD TOO SHORT (MIN 6 CHARS)");
      return;
    }
    if (password !== confirmPassword) {
      setError("PASSWORDS DO NOT MATCH!");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message.toUpperCase());
      setLoading(false);
    } else {
      setSuccess(true);
      await supabase.auth.signOut();
      setTimeout(() => router.push('/login'), 3000);
    }
  };

  if (sessionValid === null) return (
    <div className="h-screen bg-[#02040a] flex flex-col items-center justify-center text-emerald-400 gap-4">
      <Loader2 className="animate-spin" size={40} />
      <span className="text-[10px] font-black uppercase tracking-[0.3em]">Syncing Neural Data...</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#02040a] text-slate-300 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[500px] bg-emerald-500/5 blur-[120px] rounded-full -z-10" />

      <div className="w-full max-w-md bg-white/[0.02] border border-white/5 p-12 rounded-[3.5rem] backdrop-blur-3xl text-center">
        {!sessionValid ? (
          <div className="space-y-6">
            <AlertCircle size={50} className="text-red-500 mx-auto" />
            <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Access Denied</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-loose italic">
              Session expired. Please request a new security code.
            </p>
            <button onClick={() => router.push('/forgot-password')} className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 hover:text-black transition-all">
              Restart Recovery
            </button>
          </div>
        ) : !success ? (
          <>
            <div className="mb-10">
              <div className="w-14 h-14 bg-emerald-400/10 border border-emerald-400/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <ShieldCheck size={28} className="text-emerald-400" />
              </div>
              <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter leading-none">New Password</h2>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mt-3 italic">Override existing security key</p>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <div className="relative group text-left">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-400" size={18} />
                <input 
                  type="password" required placeholder="NEW PASSWORD" 
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 p-5 pl-14 rounded-2xl outline-none text-white focus:border-emerald-400/30 transition-all font-bold text-xs tracking-widest" 
                />
              </div>

              <div className="relative group text-left">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-400" size={18} />
                <input 
                  type="password" required placeholder="CONFIRM PASSWORD" 
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 p-5 pl-14 rounded-2xl outline-none text-white focus:border-emerald-400/30 transition-all font-bold text-xs tracking-widest" 
                />
              </div>

              {error && <p className="text-red-500 text-[9px] font-black uppercase tracking-widest">{error}</p>}

              <button disabled={loading} className="w-full bg-emerald-400 text-black p-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-3 hover:shadow-[0_0_30px_rgba(52,211,153,0.2)] transition-all active:scale-95 disabled:opacity-50 mt-4">
                {loading ? "UPDATING CORE..." : "Confirm Update"}
              </button>
            </form>
          </>
        ) : (
          <div className="py-6 space-y-6 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-emerald-400/10 rounded-full flex items-center justify-center mx-auto border border-emerald-400/20 shadow-[0_0_40px_rgba(52,211,153,0.1)]">
              <CheckCircle2 size={40} className="text-emerald-400" />
            </div>
            <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Access Restored</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-relaxed italic">
              Identity updated successfully. <br/>Redirecting to portal...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}