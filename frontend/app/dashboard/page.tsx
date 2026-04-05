"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, User, LogOut, Plus,
  Zap, PlayCircle, Activity, Menu, X, Loader2
} from 'lucide-react';

export default function Dashboard() {
  const [userName, setUserName] = useState("User");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Mock data for recent podcast deployments
  const podcasts = [
    { id: 1, title: "INTERVIEW_ALPHA_TEST", duration: "12:45", status: "Completed", score: "94" },
    { id: 2, title: "PODCAST_SEMANTIC_ANALYSIS", duration: "08:20", status: "Processing", score: "88" },
    { id: 3, title: "MARKETING_STRATEGY_V1", duration: "15:10", status: "Completed", score: "91" },
    { id: 4, title: "TECH_TRENDS_2024", duration: "22:05", status: "Completed", score: "96" },
  ];

  // Check authentication and fetch user details on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          router.push("/login"); // Redirect unauthorized users
          return;
        }
        // Set user display name from metadata or email prefix
        const name = user.user_metadata?.full_name || user.email?.split('@')[0];
        setUserName(name);
      } catch (err) {
        console.error("Auth error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [router]);

  // Sign out handler
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Loading state overlay
  if (loading) return (
    <div className="h-screen bg-[#02040a] flex items-center justify-center">
      <Loader2 className="text-emerald-400 animate-spin" size={40} />
    </div>
  );

  return (
    /* MAIN WRAPPER: Fixed height and hidden overflow to lock the viewport */
    <div className="h-screen w-full bg-[#02040a] text-slate-300 flex flex-col lg:flex-row font-sans overflow-hidden">

      {/* MOBILE HEADER: Shrink-0 ensures it doesn't compress during scroll */}
      <div className="lg:hidden flex items-center justify-between p-5 bg-[#010206] border-b border-white/5 shrink-0 z-[110]">
        <div className="flex items-center gap-3">
          <Zap size={20} className="text-emerald-400" fill="currentColor" />
          <span className="text-lg font-black italic uppercase tracking-tighter text-white">Insight<span className="text-emerald-400">Clips</span></span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 bg-white/5 rounded-lg text-emerald-400"
        >
          {isMobileMenuOpen ? <X size={26} /> : <Menu size={26} />}
        </button>
      </div>

      {/* SIDEBAR: Static on desktop, drawer-style on mobile */}
      <aside className={`
        fixed inset-y-0 left-0 z-[100] w-[280px] bg-[#010206] border-r border-white/5 transition-transform duration-300 lg:relative lg:translate-x-0 shrink-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        flex flex-col p-6 h-full
      `}>
        <div className="hidden lg:flex items-center gap-3 px-3 mb-12">
          <div className="w-10 h-10 bg-emerald-400 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Zap size={22} className="text-black" fill="currentColor" />
          </div>
          <span className="text-xl font-black italic uppercase tracking-tighter text-white">Insight<span className="text-emerald-400">Clips</span></span>
        </div>

        <nav className="flex-1 flex flex-col gap-3 mt-16 lg:mt-0">
          <SidebarLink href="/dashboard" icon={<LayoutDashboard size={22} />} label="Neural Console" active onClick={() => setIsMobileMenuOpen(false)} />
          <SidebarLink href="/profile" icon={<User size={22} />} label="Profile Settings" onClick={() => setIsMobileMenuOpen(false)} />
          <SidebarLink href="#" icon={<Activity size={22} />} label="Analytics" onClick={() => setIsMobileMenuOpen(false)} />
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5">
          <button onClick={handleLogout} className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-red-500/60 hover:bg-red-500/10 hover:text-red-400 transition-all group">
            <LogOut size={22} />
            <span className="text-[11px] font-black uppercase tracking-[0.2em]">Terminate Session</span>
          </button>
        </div>
      </aside>

      {/* SCROLLABLE MAIN CONTENT AREA */}
      <main className="flex-1 h-full overflow-y-auto bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent scrollbar-hide">
        <div className="max-w-7xl mx-auto p-6 md:p-10 lg:p-16">

          <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 mb-16">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl xl:text-6xl font-black italic uppercase tracking-tighter text-white leading-tight">
                Welcome, <span className="text-emerald-400">{userName.split(' ')[0]}</span>
              </h1>
              <div className="flex items-center gap-3">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500/60 italic">System Status: Optimal</p>
              </div>
            </div>

            <button className="w-full sm:w-auto bg-white text-black px-10 py-5 rounded-2xl font-bold text-[12px] uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:bg-emerald-400 transition-all group">
              <Plus size={20} className="group-hover:rotate-90 transition-transform" /> New Deployment
            </button>
          </header>

          <section className="pb-20">
            {/* Added bottom padding to ensure scroll clearance */}
            <div className="flex items-center gap-6 mb-12">
              <h3 className="shrink-0 text-[11px] font-black uppercase tracking-[0.4em] text-white/20 italic">Recent Deployments</h3>
              <div className="h-[1px] w-full bg-white/5" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {podcasts.map((p) => (
                <div key={p.id} className="group bg-white/[0.02] border border-white/5 p-6 rounded-[2.5rem] hover:bg-white/[0.04] transition-all">
                  <div className="aspect-video bg-black/60 rounded-[2rem] mb-8 flex items-center justify-center relative overflow-hidden">
                    <PlayCircle size={48} className="text-white/10 group-hover:text-emerald-400 transition-all" />
                    <div className="absolute top-4 left-4 bg-emerald-400 text-black px-3 py-1 rounded-lg text-[9px] font-black italic">AI SCORE: {p.score}</div>
                    <div className="absolute bottom-4 right-4 bg-black/80 px-3 py-1.5 rounded-lg text-[9px] font-black text-white italic border border-white/5">{p.duration} MIN</div>
                  </div>

                  <div className="space-y-4 mb-8">
                    <h4 className="text-lg font-black italic uppercase text-white truncate group-hover:text-emerald-400 transition-colors leading-tight">{p.title}</h4>
                    <div className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase border ${p.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse'
                      }`}>
                      {p.status}
                    </div>
                  </div>

                  <button className="w-full py-4 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:bg-emerald-400 hover:text-black transition-all">
                    Open Clip Editor
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Overlay for mobile menu background dimming */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}
    </div>
  );
}

/**
 * Reusable Sidebar Navigation Link
 */
function SidebarLink({ href, icon, label, active = false, onClick }: any) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group ${active
          ? 'bg-emerald-400 text-black shadow-[0_0_20px_rgba(52,211,153,0.3)] font-black italic'
          : 'text-slate-400 hover:bg-white/[0.05] hover:text-white font-bold'
        }`}
    >
      <div className={active ? 'text-black' : 'group-hover:scale-110 transition-transform text-emerald-400/60'}>
        {icon}
      </div>
      <span className="text-[12px] uppercase tracking-[0.15em]">{label}</span>
    </Link>
  );
}