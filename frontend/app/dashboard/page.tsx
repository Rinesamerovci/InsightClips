"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { LayoutDashboard, User, Video, LogOut, Plus, Clock, CheckCircle2, BarChart3 } from 'lucide-react';

export default function Dashboard() {
  const [userName, setUserName] = useState("Pënar Kera");
  const [podcasts, setPodcasts] = useState([
    { id: 1, title: "Podcasti i parë - Test i UI", duration: "12:45", status: "Kryer" },
    { id: 2, title: "Analiza e Clips me AI", duration: "08:20", status: "Në proces" },
  ]);

  // Kjo pjesë e merr emrin e ruajtur në memorien e browser-it
  useEffect(() => {
    const savedName = localStorage.getItem("userName");
    if (savedName) setUserName(savedName);
  }, []);

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex font-sans selection:bg-[#d7e8d2]/30">
      {/* SIDEBAR */}
      <aside className="w-72 border-r border-white/5 p-8 flex flex-col bg-[#0b1120] shrink-0 font-sans">
        <div className="flex items-center gap-3 mb-16 text-2xl font-black text-[#d7e8d2] italic">
          InsightClips
        </div>
        <nav className="flex-1 space-y-3">
          <Link href="/dashboard" className="flex items-center gap-4 bg-[#d7e8d2]/10 p-4 rounded-[1.5rem] text-[#d7e8d2] border border-[#d7e8d2]/20">
            <LayoutDashboard size={22} /> <span className="font-bold text-xs uppercase tracking-widest">Dashboard</span>
          </Link>
          <Link href="/profile" className="flex items-center gap-4 p-4 text-gray-400 hover:text-white hover:bg-white/5 rounded-[1.5rem] transition-all group">
            <User size={22} className="group-hover:scale-110 transition-transform" /> 
            <span className="font-bold text-xs uppercase tracking-widest">Profili</span>
          </Link>
        </nav>
        <Link href="/" className="flex items-center gap-4 p-4 text-red-400 hover:bg-red-400/5 rounded-[1.5rem] mt-auto group">
          <LogOut size={22} className="group-hover:-translate-x-1 transition-transform" /> 
          <span className="font-bold text-xs uppercase tracking-widest">Dil</span>
        </Link>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-12 bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#1e293b] overflow-y-auto">
        <header className="flex justify-between items-center mb-16 pb-8 border-b border-white/5">
          <div>
            <h2 className="text-4xl font-black tracking-tighter">Mirë se erdhe, {userName}</h2>
            <p className="text-gray-400 mt-2 text-sm italic opacity-70">Statusi: Menaxher i Projektit</p>
          </div>
          <button onClick={() => alert("Upload do të jetë funksional në Sprint 2!")} className="bg-[#d7e8d2] text-black px-8 py-4 rounded-[2rem] font-black flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-[#d7e8d2]/10 group">
            <Plus size={22} className="group-hover:rotate-90 transition-transform duration-300" /> 
            <span>Upload i ri</span>
          </button>
        </header>

        <section>
          <h3 className="text-xl font-bold mb-8 text-gray-200 tracking-tight uppercase text-xs">Podkastet tuaja</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {podcasts.map((p) => (
              <div key={p.id} className="bg-white/[0.03] border border-white/10 p-8 rounded-[2.5rem] backdrop-blur-xl hover:border-[#d7e8d2]/40 transition-all duration-300 group shadow-2xl">
                <div className="p-4 bg-[#d7e8d2]/10 rounded-2xl text-[#d7e8d2] w-fit mb-6">
                  <Video size={28} />
                </div>
                <h4 className="text-xl font-extrabold mb-2 group-hover:text-[#d7e8d2] transition-colors">{p.title}</h4>
                <div className="flex items-center gap-4 text-gray-500 text-sm mb-8">
                   <Clock size={16} /> {p.duration} min
                </div>
                <div className={`flex items-center gap-2 text-[10px] font-black px-4 py-2 rounded-full w-fit border shadow-inner
                  ${p.status === 'Kryer' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                  {p.status === 'Kryer' && <CheckCircle2 size={14} />}
                  {p.status.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}