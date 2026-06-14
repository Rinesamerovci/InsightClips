"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/context/AuthContext";

const protectedPrefixes = [
  "/analytics",
  "/clips",
  "/dashboard",
  "/podcasts",
  "/profile",
  "/settings",
  "/upload",
];

function isProtectedPath(pathname: string): boolean {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function AuthRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { backendToken, loading, user } = useAuth();
  const protectedPath = isProtectedPath(pathname);
  const authenticated = Boolean(user || backendToken);

  useEffect(() => {
    if (!protectedPath || loading || authenticated) {
      return;
    }

    const queryString = window.location.search;
    const nextPath = queryString ? `${pathname}${queryString}` : pathname;
    router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
  }, [authenticated, loading, pathname, protectedPath, router]);

  if (protectedPath && (loading || !authenticated)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1008] text-[#a3d06b]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#2b3d1e] border-t-[#a3d06b]" />
      </div>
    );
  }

  return <>{children}</>;
}
