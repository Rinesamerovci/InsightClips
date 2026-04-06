"use client";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, Info, Loader2, Lock, Mail, User, Zap } from "lucide-react";
import Link from "next/link";

import { postJson } from "@/lib/api";
import { supabase } from "@/lib/supabase";

type RegisterResponse = {
  access_token: string;
};

export default function RegisterPage() {
  const [step, setStep] = useState(1); // 1: Form, 2: OTP, 3: Success Message
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [otp, setOtp] = useState(['', '', '', '', '', '']);

  /**
   * Phase 1: Identity Creation
   */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (formData.password.length < 8) {
      setError("PASSWORD MUST BE AT LEAST 8 CHARACTERS.");
      setLoading(false);
      return;
    }

    try {
      await postJson<RegisterResponse>("/auth/register", {
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });
      setStep(3);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to create account.";
      setError(message.toUpperCase());
    } finally {
      setLoading(false);
    }
  };

  /**
   * Phase 2: Neural Verification
   */
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep(3);
    return;
    const token = otp.join("");

    const { error } = await supabase.auth.verifyOtp({
      email: formData.email,
      token: token,
      type: 'signup'
    });

    if (error) {
      setError("VERIFICATION FAILED: INVALID CODE");
      setLoading(false);
    } else {
      // Në vend që ta bëjmë redirect direkt, kalojmë te mesazhi i suksesit
      setStep(3);
      setLoading(false);
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
    <div className="min-h-screen bg-[#02040a] text-slate-300 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[500px] bg-emerald-500/5 blur-[120px] rounded-full -z-10" />

      {/* Return Navigation - Hidden on Success */}
      {step < 3 && (
        <div className="absolute top-10 left-10">
          <Link href="/" className="group flex items-center gap-3 text-emerald-400/50 hover:text-emerald-400 transition-all">
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Back to Home</span>
          </Link>
        </div>
      )}

      <div className="w-full max-w-md bg-white/[0.02] border border-white/5 p-12 rounded-[3.5rem] backdrop-blur-3xl shadow-2xl relative">
        
        {/* Header - Hidden on Success */}
        {step < 3 && (
          <div className="flex flex-col items-center mb-12 text-center">
            <div className="w-14 h-14 bg-emerald-400 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-6 transition-transform hover:scale-110 duration-500">
              <Zap size={28} className="text-black" fill="currentColor" />
            </div>
            <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white leading-none">
              {step === 1 ? "Create Identity" : "Neural Verify"}
            </h2>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 mt-3 italic">
              {step === 1 ? "Sign up for neural access" : `Sent to ${formData.email}`}
            </p>
          </div>
        )}

        {step === 1 && (
          <form className="space-y-6" onSubmit={handleRegister}>
            <div className="space-y-4">
              <div className="relative group">
                <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-400 transition-colors" size={18} />
                <input required type="text" placeholder="FULL NAME" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-black/40 border border-white/5 p-5 pl-14 rounded-2xl outline-none focus:border-emerald-400/30 text-xs font-bold tracking-widest text-white transition-all placeholder:text-slate-800" />
              </div>

              <div className="relative group">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-400 transition-colors" size={18} />
                <input required type="email" placeholder="EMAIL ADDRESS" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full bg-black/40 border border-white/5 p-5 pl-14 rounded-2xl outline-none focus:border-emerald-400/30 text-xs font-bold tracking-widest text-emerald-400 transition-all placeholder:text-slate-800" />
              </div>

              <div className="relative group">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-400 transition-colors" size={18} />
                <input required type="password" placeholder="CREATE PASSWORD" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full bg-black/40 border border-white/5 p-5 pl-14 rounded-2xl outline-none focus:border-emerald-400/30 text-xs font-bold tracking-widest text-white transition-all placeholder:text-slate-800" />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 py-3 px-4 rounded-xl text-center">
                 <p className="text-[9px] font-black uppercase tracking-widest text-red-400">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full bg-emerald-400 text-black p-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:shadow-[0_0_30px_rgba(52,211,153,0.3)] transition-all active:scale-95 border-none mt-4 disabled:opacity-50">
              {loading ? <>PROCESSING... <Loader2 size={18} className="animate-spin" /></> : <>Finalize Signup <ChevronRight size={18} /></>}
            </button>
          </form>
        )}

        {step === 2 && (
          <form className="space-y-8" onSubmit={handleVerifyOtp}>
            <div className="flex justify-between gap-2">
              {otp.map((data, index) => (
                <input key={index} type="text" maxLength={1} value={data} onChange={e => handleOtpChange(e.target, index)} className="w-10 h-14 bg-black/40 border border-white/5 rounded-xl text-center text-xl font-black text-emerald-400 outline-none focus:border-emerald-400 transition-all" />
              ))}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 py-3 px-4 rounded-xl text-center">
                 <p className="text-[9px] font-black uppercase tracking-widest text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <button type="submit" disabled={loading} className="w-full bg-emerald-400 text-black p-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50">
                {loading ? "VERIFYING..." : "Confirm Code"}
              </button>
              <button type="button" onClick={() => setStep(1)} className="w-full text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-white transition-colors">
                Edit Details
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: SUCCESS MESSAGE */}
        {step === 3 && (
          <div className="flex flex-col items-center text-center py-4 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-emerald-400/10 rounded-full flex items-center justify-center mb-6 border border-emerald-400/20">
              <CheckCircle2 size={40} className="text-emerald-400" />
            </div>
            <h2 className="text-2xl font-black uppercase text-white mb-2 tracking-tighter italic">Identity Verified</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-10 leading-relaxed">
              Registration complete. Your neural access is now active. <br/> You can proceed to login.
            </p>
            <Link href="/login" className="w-full bg-emerald-400 text-black p-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:shadow-[0_0_30px_rgba(52,211,153,0.3)] transition-all">
              Proceed to Login <ChevronRight size={18} />
            </Link>
          </div>
        )}

        {step < 3 && (
          <p className="text-center mt-10 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
            Already have access? <Link href="/login" className="text-emerald-400 hover:underline underline-offset-4 ml-1 font-black transition-all">Login</Link>
          </p>
        )}
      </div>

      <div className="absolute bottom-10 opacity-20 text-[8px] font-black uppercase tracking-[0.5em] flex items-center gap-2">
        <Info size={10} /> InsightClips • Security Protocol v3.0
      </div>
    </div>
  );
}
