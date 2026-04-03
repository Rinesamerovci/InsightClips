"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase"; // Using the centralized client
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("Registration successful! You can now log in.");
      router.push("/login");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 font-sans text-white">
      <div className="bg-[#111827] border border-white/10 p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl text-center">
        <h1 className="text-4xl font-black mb-2 italic text-[#d7e8d2]">CREATE ACCOUNT</h1>
        <p className="text-white/50 mb-8 font-medium italic">Start your journey with InsightClips</p>
        
        <form onSubmit={handleRegister} className="space-y-4 text-left">
          <input 
            type="email" 
            placeholder="Email Address" 
            required
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-[#d7e8d2]/50 transition-all text-white"
          />
          
          <input 
            type="password" 
            placeholder="Create Password" 
            required
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl outline-none focus:border-[#d7e8d2]/50 transition-all text-white"
          />

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-[#d7e8d2] text-black font-black py-4 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all mt-4 disabled:opacity-50"
          >
            {loading ? "REGISTERING..." : "REGISTER NOW"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-white/40 text-sm font-medium italic">
            Already have an account?{" "}
            <span 
              onClick={() => router.push('/login')} 
              className="text-[#d7e8d2] cursor-pointer hover:underline font-black transition-all"
            >
              Log in here
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}