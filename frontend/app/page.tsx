"use client";
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { 
  Zap, 
  Shield, 
  Sparkles, 
  Globe, 
  Cpu, 
  Layers, 
  BarChart3, 
  CheckCircle2,
  Play,
  MoveRight
} from 'lucide-react';

export default function InsightClipsLanding() {
  const [scrolled, setScrolled] = useState(false);
  const [activeFeature, setActiveFeature] = useState(1);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToFeatures = () => {
    const element = document.getElementById('features-section');
    element?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#02040a] text-slate-300 font-sans selection:bg-emerald-400/30 selection:text-white overflow-x-hidden">
      
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[150px] rounded-full -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 blur-[150px] rounded-full -z-10" />

      {/* --- NAVIGATION --- */}
      <nav className={`fixed top-0 w-full z-[100] transition-all duration-500 ${
        scrolled ? 'py-4 backdrop-blur-xl bg-[#02040a]/90 border-b border-white/5 shadow-2xl' : 'py-8'
      }`}>
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
            <div className="w-10 h-10 bg-emerald-400 rounded-xl flex items-center justify-center group-hover:rotate-6 transition-all shadow-lg shadow-emerald-500/20">
              <Zap size={20} className="text-black" fill="currentColor" />
            </div>
            <span className="text-xl font-black italic uppercase tracking-tighter text-white">
              Insight<span className="text-emerald-400">Clips</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-10">
            <button onClick={scrollToFeatures} className="text-[10px] uppercase font-black tracking-[0.2em] text-white/40 hover:text-emerald-400 transition-colors">
              Features
            </button>
            <Link href="/login" className="text-[10px] uppercase font-black tracking-[0.2em] text-white/40 hover:text-white transition-colors">
              Portal Login
            </Link>
            <Link href="/register" className="bg-white text-black px-8 py-3 rounded-full text-[10px] uppercase font-black hover:bg-emerald-400 transition-all shadow-xl active:scale-95">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* --- HERO SECTION --- */}
        <section className="relative h-screen flex flex-col items-center justify-center px-8 overflow-hidden">
          <div className="max-w-5xl mx-auto text-center flex flex-col items-center z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 mb-8 animate-pulse">
              <Sparkles size={14} className="text-emerald-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Next-Gen Intelligence v3.0</span>
            </div>

            <h1 className="text-6xl md:text-[100px] font-black tracking-tighter leading-[0.85] text-white uppercase italic mb-8">
              High Impact <br />
              <span className="text-slate-800">Low Effort.</span>
            </h1>

            <p className="max-w-xl mx-auto text-slate-400 text-base md:text-lg font-medium leading-relaxed italic mb-12 px-4">
              Our AI engine identifies viral-worthy clips from your long-form videos with semantic precision. Ready for social media in one click.
            </p>

            <div className="flex flex-col md:flex-row items-center gap-6">
              <Link href="/register" className="group bg-emerald-400 text-black px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:shadow-[0_0_50px_rgba(52,211,153,0.3)] transition-all flex items-center gap-4 active:scale-95 shadow-lg shadow-emerald-400/10">
                Initiate Uplink <MoveRight size={18} className="group-hover:translate-x-2 transition-transform" />
              </Link>
              <button className="group flex items-center gap-4 px-10 py-5 rounded-2xl border border-white/5 bg-white/5 text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-white/10 transition-all">
                <div className="w-8 h-8 rounded-full bg-emerald-400/10 flex items-center justify-center">
                  <Play size={14} className="text-emerald-400 ml-1" fill="currentColor" />
                </div>
                Watch Briefing
              </button>
            </div>
          </div>

          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 opacity-20 animate-bounce">
            <div className="w-1 h-10 bg-gradient-to-b from-emerald-400 to-transparent rounded-full" />
          </div>
        </section>

        {/* --- INTERACTIVE BENTO GRID (FEATURES) --- */}
        <section id="features-section" className="max-w-7xl mx-auto px-8 pb-40 pt-20">
          <div className="grid md:grid-cols-3 gap-6">
            <ServiceButton 
              icon={<Cpu size={28} />} 
              title="Semantic AI" 
              desc="Analyzes voice tone and visual hooks to find the 'gold' moments."
              tag="Engine"
              active={activeFeature === 0}
              onClick={() => setActiveFeature(0)}
            />
            <ServiceButton 
              icon={<Layers size={28} />} 
              title="Smart Cropping" 
              desc="Auto-reframing for TikTok, Reels & Shorts with zero manual work."
              tag="Output"
              active={activeFeature === 1}
              onClick={() => setActiveFeature(1)}
            />
            <ServiceButton 
              icon={<BarChart3 size={28} />} 
              title="Viral Score" 
              desc="Engagement prediction using our proprietary neural ranking."
              tag="Analytics"
              active={activeFeature === 2}
              onClick={() => setActiveFeature(2)}
            />
          </div>
        </section>

        {/* --- STATS SECTION --- */}
        <section className="max-w-7xl mx-auto px-8 py-20 border-t border-white/5 bg-white/[0.01] rounded-[3rem] mb-40">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            <Stat val="0.4s" label="Inference Latency" />
            <Stat val="12M+" label="Clips Processed" />
            <Stat val="99.9%" label="Uptime Record" />
            <Stat val="MIT" label="Architecture" />
          </div>
        </section>
      </main>

      {/* --- FOOTER --- */}
      <footer className="border-t border-white/5 py-16 bg-[#010206]">
        <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="flex items-center gap-3">
              <Zap size={20} className="text-emerald-400" fill="currentColor" />
              <span className="text-lg font-bold uppercase italic tracking-tighter text-white">InsightClips</span>
            </div>
            <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.4em]">
              © 2026 CLOUD SYSTEMS • CORE INSTANCE
            </p>
          </div>
          <div className="flex gap-8">
             <FooterIcon icon={<Globe size={18} />} label="Global" />
             <FooterIcon icon={<Shield size={18} />} label="Secure" />
             <FooterIcon icon={<CheckCircle2 size={18} />} label="Online" />
          </div>
        </div>
      </footer>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
    </div>
  );
}

/**
 * Interactive feature button used in the bento grid.
 */
type ServiceButtonProps = {
  icon: ReactNode;
  title: string;
  desc: string;
  tag: string;
  active: boolean;
  onClick: () => void;
};

function ServiceButton({ icon, title, desc, tag, active, onClick }: ServiceButtonProps) {
  return (
    <button onClick={onClick} className={`group relative flex flex-col items-start text-left p-10 rounded-[2.5rem] border transition-all duration-700 overflow-hidden outline-none ${
      active ? 'bg-emerald-400 border-transparent shadow-2xl scale-[1.03] z-10' : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
    }`}>
      <div className={`absolute -top-10 -right-10 w-40 h-40 blur-[60px] rounded-full transition-opacity duration-700 ${active ? 'bg-black/20 opacity-100' : 'bg-emerald-500/10 opacity-0 group-hover:opacity-100'}`} />
      <div className={`mb-12 p-5 rounded-2xl transition-all duration-500 ${active ? 'bg-black text-emerald-400 rotate-6' : 'bg-emerald-400/10 text-emerald-400'}`}>
        {icon}
      </div>
      <div className={`text-[10px] font-black uppercase tracking-[0.3em] mb-4 ${active ? 'text-black/50' : 'text-emerald-500/40'}`}>[{tag}]</div>
      <h3 className={`text-2xl font-black italic uppercase tracking-tighter mb-4 ${active ? 'text-black' : 'text-white'}`}>{title}</h3>
      <p className={`text-sm font-medium leading-relaxed italic ${active ? 'text-black/70' : 'text-slate-500'}`}>{desc}</p>
    </button>
  );
}

/**
 * Standardized stat display component.
 */
type StatProps = {
  val: string;
  label: string;
};

function Stat({ val, label }: StatProps) {
  return (
    <div className="flex flex-col items-center text-center gap-2 transition-transform hover:scale-110">
      <div className="text-4xl font-black text-white italic tracking-tighter">{val}</div>
      <div className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em]">{label}</div>
    </div>
  );
} 

/**
 * Small utility icon for the footer links.
 */
type FooterIconProps = {
  icon: ReactNode;
  label: string;
};

function FooterIcon({ icon, label }: FooterIconProps) {
  return (
    <div className="flex items-center gap-2 text-slate-700 hover:text-emerald-400 transition-colors cursor-pointer group">
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">{label}</span>
    </div>
  );
}
