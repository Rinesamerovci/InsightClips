"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { User, Mail, ShieldCheck, ArrowLeft, Camera, Check } from 'lucide-react';

export default function ProfilePage() {
  const [name, setName] = useState("Pënar Kera");
  const [email, setEmail] = useState("penar.kera@student.uni-pr.edu");
  const [saved, setSaved] = useState(false);

  // Ngarkon të dhënat e ruajtura kur hapet faqja
  useEffect(() => {
    const savedName = localStorage.getItem("userName");
    const savedEmail = localStorage.getItem("userEmail");
    if (savedName) setName(savedName);
    if (savedEmail) setEmail(savedEmail);
  }, []);

  const handleSave = () => {
    localStorage.setItem("userName", name);
    localStorage.setItem("userEmail", email);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000); // Heq mesazhin e suksesit pas 2 sekondave
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-12 flex flex-col items-center">
      <div className="w-full max-w-3xl">
        <Link href="/dashboard" className="inline-flex items-center gap-3 text-[#d7e8d2] mb-12 hover:bg-white/5 px-6 py-3 rounded-2xl border border-white/5 transition-all group">
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold text-xs uppercase tracking-[0.2em]">Kthehu te Dashboard</span>
        </Link>

        <div className="bg-[#111827] border border-white/10 rounded-[3rem] p-12 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="flex flex-col md:flex-row items-center gap-10 mb-12 border-b border-white/5 pb-12">
            <div className="relative">
              <div className="w-32 h-32 bg-gradient-to-br from-[#d7e8d2] to-[#a3b899] rounded-[2.5rem] flex items-center justify-center text-[#0f172a] text-4xl font-black rotate-3 shadow-2xl">
                {name.substring(0, 2).toUpperCase()}
              </div>
              <div className="absolute -bottom-2 -right-2 p-2 bg-slate-800 rounded-xl border border-white/10 text-[#d7e8d2] cursor-pointer hover:bg-[#d7e8d2] hover:text-black transition-colors">
                <Camera size={16} />
              </div>
            </div>
            <div className="text-center md:text-left">
              <h2 className="text-4xl font-black tracking-tighter mb-2 italic">{name}</h2>
              <p className="text-[#d7e8d2] font-bold text-[10px] uppercase tracking-[0.4em] opacity-60 italic">Software Engineering Student</p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-2">Shkruaj Emrin Tënd</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/5 p-5 rounded-[1.5rem] focus:border-[#d7e8d2]/50 outline-none font-bold text-gray-200 transition-all shadow-inner"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-2">Email Adresa</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/5 p-5 rounded-[1.5rem] focus:border-[#d7e8d2]/50 outline-none font-medium text-gray-400 transition-all shadow-inner italic"
              />
            </div>
          </div>
          
          <button 
            onClick={handleSave}
            className={`mt-12 w-full md:w-auto px-12 py-4 rounded-[1.5rem] font-black transition-all flex items-center justify-center gap-3 shadow-xl
              ${saved ? 'bg-green-500 text-white' : 'bg-[#d7e8d2] text-black hover:scale-[1.03]'}`}
          >
            {saved ? <><Check size={20} /> U RUAJT!</> : "RUAJ NDRYSHIMET"}
          </button>
        </div>
      </div>
    </div>
  );
}