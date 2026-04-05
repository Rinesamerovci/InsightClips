"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Zap, Mail, ChevronRight, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState(1); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      setError(error.message.toUpperCase());
      setLoading(false);
    } else {
      setStep(2);
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const token = otp.join("");

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    });

    if (error) {
      setError("INVALID OR EXPIRED CODE");
      setLoading(false);
    } else {
      router.push('/reset-password');
    }
  };

  const handleOtpChange = (element: HTMLInputElement, index: number) => {
    if (isNaN(Number(element.value))) return false;
    const newOtp = [...otp];
    newOtp[index] = element.value;
    setOtp(newOtp);
    if (element.value !== "" && element.nextSibling) {
      (element.nextSibling as HTMLInputElement).focus();
    }
  };

  return (
    <div className="min-h-screen bg-[#02040a] text-slate-300 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
      
      {/* Aesthetic Background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[500px] bg-emerald-500/5 blur-[120px] rounded-full -z-10" />

      {/* NAVIGATION: BACK TO PORTAL (Jashtë kartës, lart majtas) */}
      <div className="absolute top-10 left-10">
        <Link href="/login" className="group flex items-center gap-3 text-emerald-400/50 hover:text-emerald-400 transition-all">
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Back to Login</span>
        </Link>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md bg-white/[0.02] border border-white/5 p-12 rounded-[3.5rem] backdrop-blur-3xl shadow-2xl text-center relative">
        <div className="mb-10">
          <div className="w-14 h-14 bg-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(52,211,153,0.2)] transition-transform hover:scale-110 duration-500">
            <Zap size={28} className="text-black" fill="currentColor" />
          </div>
          <h2 className="text-3xl font-black italic uppercase text-white tracking-tighter leading-none">
            {step === 1 ? "Reset Access" : "Verify OTP"}
          </h2>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 mt-4 italic">
            {step === 1 ? "Enter email for security uplink" : `Security code sent to ${email}`}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleSendOtp} className="space-y-6">
            <div className="relative group text-left">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-400 transition-colors" size={18} />
              <input 
                type="email" required placeholder="EMAIL ADDRESS" 
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/40 border border-white/5 p-5 pl-14 rounded-2xl outline-none text-white focus:border-emerald-400/30 transition-all font-bold text-xs tracking-widest placeholder:text-slate-800" 
              />
            </div>
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 py-3 px-4 rounded-xl text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-red-400">{error}</p>
              </div>
            )}

            <button disabled={loading} className="w-full bg-emerald-400 text-black p-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-3 hover:shadow-[0_0_40px_rgba(52,211,153,0.3)] transition-all active:scale-95 disabled:opacity-50 mt-4">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <>Request Code <ChevronRight size={18} /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-8">
            <div className="flex justify-between gap-2">
              {otp.map((data, index) => (
                <input 
                  key={index} type="text" maxLength={1} value={data} 
                  onChange={e => handleOtpChange(e.target, index)}
                  className="w-12 h-16 bg-black/40 border border-white/5 rounded-xl text-center text-xl font-black text-emerald-400 outline-none focus:border-emerald-400 transition-all" 
                />
              ))}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 py-3 px-4 rounded-xl text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-red-400">{error}</p>
              </div>
            )}

            <button disabled={loading} className="w-full bg-emerald-400 text-black p-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95">
              {loading ? "VERIFYING..." : "Validate Access"}
            </button>
            
            <button type="button" onClick={() => setStep(1)} className="text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-white transition-colors">
              Wrong Email?
            </button>
          </form>
        )}
      </div>

      {/* Branding Footer */}
      <div className="absolute bottom-10 opacity-20 text-[8px] font-black uppercase tracking-[0.5em] flex items-center gap-2">
        Neural Protocol v3.0
      </div>
    </div>
  );
}