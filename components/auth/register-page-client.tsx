"use client";

import { FormEvent, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BrandBadge } from "@/components/branding/brand-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { GradientDots } from "@/components/ui/gradient-dots";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/components/auth/auth-provider";
import { Check } from "lucide-react";

export function RegisterPageClient() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+91 ");
  const [country, setCountry] = useState("India");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [countries, setCountries] = useState<{ name: string, code: string, flag: string, dialCode: string }[]>([]);

  useEffect(() => {
    async function fetchCountries() {
      try {
        const res = await fetch("https://restcountries.com/v3.1/all?fields=name,cca3,flags,idd");
        if (!res.ok) return;
        const data = await res.json();
        const formatted = data.map((d: any) => {
          const dialCode = d.idd?.root ? (d.idd.root + (d.idd.suffixes?.[0] || "")) : "";
          return {
            name: d.name.common,
            code: d.cca3,
            flag: d.flags.svg || d.flags.png,
            dialCode,
          };
        }).sort((a: any, b: any) => a.name.localeCompare(b.name));
        setCountries(formatted);
      } catch (err) {
        console.error("Failed to fetch countries", err);
      }
    }
    fetchCountries();
  }, []);

  const handleCountryChange = (val: string) => {
    setCountry(val);
    const selectedCountry = countries.find((c) => c.name === val);
    if (!selectedCountry?.dialCode) return;

    if (!phone) {
      setPhone(selectedCountry.dialCode + " ");
      return;
    }

    const currentCountry = countries.find((c) => c.name === country);
    const oldDialCode = currentCountry?.dialCode;

    if (oldDialCode && phone.startsWith(oldDialCode)) {
      setPhone(phone.replace(oldDialCode, selectedCountry.dialCode));
    } else if (!phone.startsWith("+")) {
      setPhone(selectedCountry.dialCode + " " + phone);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!fullName.trim() || !email.trim() || !country.trim() || !password || !confirmPassword) {
      setError("Please complete all required fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!acceptedTerms) {
      setError("Please accept the terms to continue.");
      return;
    }

    setSubmitting(true);

    try {
      const resp = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, phone, country, password }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || "Registration failed");
      }

      setSuccess("Account created successfully! Redirecting to dashboard...");

      // Refresh auth context so the app recognizes the new session
      await refresh();

      setTimeout(() => {
        router.push("/dashboard");
      }, 1000);
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

      <div className="relative z-10 w-full max-w-md">
        <Card className="relative z-10 w-full max-w-md border-white/5 bg-white/5 shadow-2xl backdrop-blur-2xl p-6 sm:p-8 rounded-2xl">
          <CardHeader className="space-y-4 px-0 pt-0">
            <div className="flex flex-col items-center gap-4 text-center pb-2">
              <BrandBadge />
              <div className="space-y-1 mt-1">
                <CardTitle className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white pb-1">
                  Create your fxtrusts account
                </CardTitle>
              </div>
            </div>
            <p className="text-center text-xs sm:text-sm text-foreground/60">
              Enter your details below to create your account and access the CRM dashboard.
            </p>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground" htmlFor="fullName">
                    Full Name
                  </label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                    required
                    className="h-11 px-4 bg-transparent border-white/20 focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-full text-white placeholder:text-white/20 transition-all font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground" htmlFor="email">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    className="h-11 px-4 bg-transparent border-white/20 focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-full text-white placeholder:text-white/20 transition-all font-medium"
                  />
                </div>

                {/* Calculate phone completeness dynamically */}
                {(() => {
                  const currentCountryObj = countries.find((c) => c.name === country);
                  const currentDialCode = currentCountryObj?.dialCode || "";

                  let rawLocalDigits = "";
                  if (currentDialCode && phone.startsWith(currentDialCode)) {
                    rawLocalDigits = phone.slice(currentDialCode.length).replace(/\D/g, "");
                  } else if (phone.includes(" ")) {
                    rawLocalDigits = phone.split(" ").slice(1).join("").replace(/\D/g, "");
                  } else {
                    rawLocalDigits = phone.replace(/\D/g, "");
                  }

                  const isPhoneComplete = rawLocalDigits.length === 10;

                  return (
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground" htmlFor="phone">
                        Phone Number
                      </label>
                      <div className="flex">
                        <Select value={country} onValueChange={handleCountryChange}>
                          <SelectTrigger className="w-[100px] h-11 rounded-full rounded-r-none border-r-0 focus:relative focus:z-10 bg-transparent border-white/20 hover:bg-white/[0.05] pl-4">
                            <SelectValue placeholder="Code">
                              {country ? (
                                <div className="flex items-center gap-2">
                                  <img
                                    src={countries.find(c => c.name === country)?.flag}
                                    alt="flag"
                                    className="h-3.5 w-5 flex-shrink-0 object-cover rounded-[2px]"
                                  />
                                  <span className="font-semibold text-xs tracking-wide">
                                    {countries.find(c => c.name === country)?.code}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground font-medium">Ext</span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-h-48 overflow-y-auto bg-black border-white/10 text-white min-w-[120px]">
                            <SelectGroup>
                              {countries.map((c) => (
                                <SelectItem key={c.code} value={c.name} className="pr-2">
                                  <div className="flex items-center gap-2">
                                    <img src={c.flag} alt={`${c.code} flag`} className="h-3.5 w-5 object-cover rounded-[2px]" />
                                    <span className="font-medium tracking-wide text-xs">{c.code}</span>
                                    <span className="text-[10px] text-muted-foreground">({c.dialCode})</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <div className="relative flex-1">
                          <Input
                            id="phone"
                            type="tel"
                            value={phone}
                            onChange={(event) => {
                              const newVal = event.target.value;

                              let localPart = newVal;
                              if (currentDialCode && newVal.startsWith(currentDialCode)) {
                                localPart = newVal.slice(currentDialCode.length);
                              } else if (newVal.includes(" ")) {
                                localPart = newVal.split(" ").slice(1).join("");
                              }

                              const digitsOnly = localPart.replace(/\D/g, "");

                              if (digitsOnly.length > 10 && newVal.length > phone.length) {
                                return; // block extra numbers 
                              }

                              setPhone(newVal);
                            }}
                            autoComplete="tel"
                            placeholder="555 123 4567"
                            className="w-full h-11 px-4 bg-transparent border-white/20 focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-full rounded-l-none focus:relative focus:z-10 pr-10 text-white font-medium"
                          />
                          {isPhoneComplete && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)] pointer-events-none transition-all duration-300 animate-in zoom-in fade-in">
                              <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white" strokeWidth={4} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground" htmlFor="password">
                      Password
                    </label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                      className="h-11 px-4 bg-transparent border-white/20 focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-full text-white placeholder:text-white/20 transition-all font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground" htmlFor="confirmPassword">
                      Confirm
                    </label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                      className="h-11 px-4 bg-transparent border-white/20 focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-full text-white placeholder:text-white/20 transition-all font-medium"
                    />
                  </div>
                </div>
              </div>

              <label className="flex items-start gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground pt-1">
                <Checkbox checked={acceptedTerms} onCheckedChange={setAcceptedTerms} className="mt-0.5 sm:mt-1 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="leading-snug">I agree to the terms, privacy policy, and onboarding follow-up from fxtrusts.</span>
              </label>

              {error ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] sm:text-sm font-medium text-rose-700">
                  {error}
                </p>
              ) : null}

              {success ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] sm:text-sm font-medium text-emerald-700">
                  {success}
                </p>
              ) : null}

              <div className="space-y-2 sm:space-y-3 pt-1 sm:pt-2">
                <Button
                  type="submit"
                  className="w-full bg-[#22c55e] text-black hover:bg-[#16a34a] h-11 sm:h-11 text-sm rounded-full font-bold transition-colors shadow-lg shadow-emerald-500/20"
                  disabled={submitting}
                >
                  {submitting ? "Preparing..." : "Create Account"}
                </Button>
                <p className="text-center text-xs sm:text-sm text-muted-foreground">
                  Already registered?{" "}
                  <Link href="/login" className="font-semibold text-primary hover:text-primary/80">
                    Sign in
                  </Link>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
