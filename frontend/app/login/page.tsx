"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase"; // Using the centralized client
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert("Error: " + error.message);
    } else {
      router.push("/dashboard");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 font-sans">
      <div className="bg-[#111827] border border-white/10 p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl">
        <h1 className="text-4xl font-black text-white mb-2 italic">InsightClips</h1>
        <p className="text-white/50 mb-8 font-medium italic">Welcome back! Enter your details.</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <input 
            type="email" 
            placeholder="Email Address" 
            required
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-white outline-none focus:border-[#d7e8d2]/50 transition-all"
          />
          
          <input 
            type="password" 
            placeholder="Password" 
            required
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-white outline-none focus:border-[#d7e8d2]/50 transition-all"
          />

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-[#d7e8d2] text-black font-black py-4 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all mt-4 disabled:opacity-50"
          >
            {loading ? "ENTERING..." : "LOG IN"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-white/40 text-sm font-medium italic">
            Don't have an account?{" "}
            <span 
              onClick={() => router.push('/register')} 
              className="text-[#d7e8d2] cursor-pointer hover:underline font-black transition-all"
            >
              Register here
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}