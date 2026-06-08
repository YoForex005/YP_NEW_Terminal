"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { BrandBadge } from "@/components/branding/brand-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradientDots } from "@/components/ui/gradient-dots";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";

const resolveNextPath = (rawNextPath: string | null): string => {
  if (!rawNextPath || !rawNextPath.startsWith("/") || rawNextPath.startsWith("//")) {
    return "/";
  }

  if (
    rawNextPath === "/login" ||
    rawNextPath === "/register" ||
    rawNextPath === "/health" ||
    rawNextPath.startsWith("/api/")
  ) {
    return "/";
  }

  return rawNextPath;
};

export function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nextPath = resolveNextPath(searchParams.get("next"));

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(nextPath);
    }
  }, [isLoading, nextPath, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await login({ email, password });

      if (!result.ok) {
        setError(result.error ?? "Login failed. Please try again.");
        setSubmitting(false);
        return;
      }

      router.replace(nextPath);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setSubmitting(false);
    }
  };

  return (
    <main className="dark relative isolate flex min-h-[100dvh] w-full flex-col bg-gradient-to-br from-blue-950 via-black to-emerald-950 text-foreground selection:bg-emerald-500/30 items-center justify-center p-4 sm:p-6">
      {/* Gradient dots — uses the same dark blue-black from the page gradient */}
      <GradientDots
        backgroundColor="#070d1a"
        dotSize={6}
        spacing={12}
        duration={30}
        colorCycleDuration={8}
        className="z-0 opacity-40"
      />
      {/* Ambient lighting orbs — sit above dots, below card */}
      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] h-[600px] w-[600px] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[800px] w-[800px] rounded-full bg-emerald-600/20 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <Card className="relative z-10 w-full max-w-sm border-white/5 bg-white/5 shadow-2xl backdrop-blur-2xl p-6 sm:p-8 rounded-2xl">
          <CardHeader className="space-y-4 px-0 pt-0">
            <div className="flex flex-col items-center gap-4 text-center pb-2">
              <BrandBadge />
              <div className="space-y-1 mt-1">
                <CardTitle className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white pb-1">
                  Sign in to fxtrusts
                </CardTitle>
              </div>
            </div>
            <p className="text-center text-xs sm:text-sm text-foreground/60">
              Access your dashboard, wallet, trading accounts, and social tools.
            </p>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5 flex flex-col">
                <label className="text-xs font-semibold text-white/90 ml-0.5" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  placeholder="Email Address"
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="h-11 px-4 bg-transparent border-white/20 focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-full text-white placeholder:text-white/20 transition-all font-medium"
                />
              </div>
              <div className="space-y-1.5 flex flex-col">
                <label className="text-xs font-semibold text-white/90 ml-0.5" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  placeholder="Password"
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="h-11 px-4 bg-transparent border-white/20 focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-full text-white placeholder:text-white/20 transition-all font-medium"
                />
              </div>

              {error ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {error}
                </p>
              ) : null}

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full h-11 bg-[#22c55e] text-black hover:bg-[#16a34a] rounded-full font-bold transition-colors shadow-lg shadow-emerald-500/20"
                  disabled={submitting}
                >
                  {submitting ? "Signing in..." : "Sign In"}
                </Button>
              </div>

              <p className="text-center text-xs text-foreground/50 mt-4">
                New to fxtrusts?{" "}
                <Link href="/register" className="font-semibold text-white hover:text-white/80 transition-colors">
                  Create an account
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

