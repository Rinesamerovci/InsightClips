"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, Camera, Zap,
  User, Loader2, Lock, Eye, EyeOff, X
} from 'lucide-react';

export default function ProfilePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const router = useRouter();

  // Fetch current user data on component mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setName(user.user_metadata?.full_name || "");
        setEmail(user.email || "");
      } else {
        router.push("/login");
      }
      setLoading(false);
    };
    getUser();
  }, [router]);

  /**
   * Handles profile updates including Display Name and Password.
   */
  const handleUpdateProfile = async () => {
    setUpdating(true);
    setNotification(null);
    let passwordChanged = false;

    // 1. Update metadata (Full Name)
    const { error: nameError } = await supabase.auth.updateUser({
      data: { full_name: name }
    });

    if (nameError) {
      setNotification({ type: 'error', msg: "Update Failed: " + nameError.message });
      setUpdating(false);
      return;
    }

    // 2. Check if user intends to update the password
    if (newPassword.length > 0) {
      if (newPassword.length < 6) {
        setNotification({ type: 'error', msg: "Security: Passcode must be at least 6 characters." });
        setUpdating(false);
        return;
      }

      const { error: passError } = await supabase.auth.updateUser({ password: newPassword });

      if (passError) {
        setNotification({ type: 'error', msg: "Key Error: " + passError.message });
        setUpdating(false);
        return;
      }
      passwordChanged = true;
    }

    // 3. Final Notification logic
    if (passwordChanged) {
      setNotification({
        type: 'success',
        msg: `SUCCESS: ACCESS KEY UPDATED. CONFIRMATION SENT TO ${email.toUpperCase()}`
      });
      setNewPassword("");
    } else {
      setNotification({ type: 'success', msg: "Neural profile synchronized." });
    }

    setUpdating(false);
    setTimeout(() => setNotification(null), 5000);
  };

  if (loading) return (
    <div className="h-screen bg-[#02040a] flex items-center justify-center">
      <Loader2 className="text-emerald-400 animate-spin" size={32} />
    </div>
  );

  return (
    <div className="h-screen w-full bg-[#02040a] text-slate-300 font-sans relative overflow-hidden flex items-center justify-center">

      {/* Decorative ambient background glows */}
      <div className="absolute top-[-5%] left-[-5%] w-[30%] h-[30%] bg-emerald-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-emerald-900/5 blur-[120px] pointer-events-none" />

      {/* Dynamic Toast Notification (Success/Error) */}
      {notification && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`p-3.5 rounded-2xl border backdrop-blur-2xl shadow-2xl flex items-start gap-3 
            ${notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <div className="flex-1">
              <p className={`text-[10px] font-bold italic leading-tight ${notification.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                {notification.msg}
              </p>
            </div>
            <button onClick={() => setNotification(null)} className="text-white/20 hover:text-white"><X size={14} /></button>
          </div>
        </div>
      )}

      {/* Dashboard Return Link */}
      <div className="absolute top-10 left-10 lg:left-20">
        <Link href="/dashboard" className="group flex items-center gap-3 text-slate-500 hover:text-emerald-400 transition-all">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10 shadow-lg transition-all">
            <ArrowLeft size={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] leading-none mb-1">Return</span>
            <span className="text-[11px] font-black uppercase tracking-[0.1em] text-white/20 group-hover:text-emerald-400/50 italic transition-all">Dashboard</span>
          </div>
        </Link>
      </div>

      {/* Profile Configuration Card */}
      <div className="w-full max-w-xl px-6 relative z-10 animate-in fade-in zoom-in duration-700">
        <div className="bg-[#080a0f]/60 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.6)] overflow-hidden">

          {/* Header & Avatar Section */}
          <div className="p-8 pb-4 flex flex-col items-center text-center border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">
            <div className="relative mb-5">
              <div className="w-24 h-24 bg-emerald-400 rounded-[2rem] rotate-3 flex items-center justify-center text-[#02040a] text-4xl font-black shadow-[0_0_40px_rgba(52,211,153,0.15)]">
                {name ? name[0].toUpperCase() : "?"}
              </div>
              <div className="absolute -bottom-1 -right-1 p-2.5 bg-[#0a0c12] border border-white/10 rounded-xl text-emerald-400 cursor-pointer">
                <Camera size={16} />
              </div>
            </div>
            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-1">{name || "Neural ID"}</h2>
            <div className="flex items-center gap-2 opacity-40">
              <span className="text-[9px] font-bold tracking-[0.2em] text-slate-400 uppercase italic">{email}</span>
            </div>
          </div>

          {/* Form Controls */}
          <div className="p-8 space-y-6">
            <div className="grid gap-5">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2 italic">Identity</label>
                <div className="relative group">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-400 transition-colors" size={18} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 p-5 rounded-[1.5rem] focus:border-emerald-500/20 focus:bg-black/60 outline-none font-bold text-white text-xs pl-14 transition-all"
                    placeholder="Enter Full Name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-emerald-500/40 uppercase tracking-[0.3em] ml-2 italic">Access Key Override</label>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-emerald-400 transition-colors" size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password" // Kjo e ndalon browser-in të plotësojë fjalëkalimin e vjetër
                    className="w-full bg-black/40 border border-white/5 p-5 rounded-[1.5rem] focus:border-emerald-500/20 focus:bg-black/60 outline-none font-bold text-white text-xs pl-14 pr-14 transition-all placeholder:text-white/5"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-emerald-400 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleUpdateProfile}
              disabled={updating}
              className="group relative w-full py-5 bg-emerald-400 hover:bg-emerald-300 text-[#02040a] rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.3em] transition-all active:scale-[0.98] disabled:opacity-50 shadow-[0_15px_40px_rgba(52,211,153,0.1)]"
            >
              <div className="flex items-center justify-center gap-2">
                {updating ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} fill="currentColor" />}
                <span>{updating ? "Syncing..." : "Update System"}</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 opacity-10">
        <p className="text-[8px] font-black tracking-[0.8em] text-white uppercase">Insight Clips Terminal</p>
      </div>
    </div>
  );
}