"use client";

import { useState, useEffect, useCallback } from "react";
import Confetti from "react-confetti";
import {
  X,
  Mail,
  Smartphone,
  ClipboardList,
  Lock,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  ShieldCheck,
  User,
  Shield,
  Check
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";

type Step = "overview" | "email" | "phone" | "profile" | "success";

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VerificationModal({ isOpen, onClose }: VerificationModalProps) {
  const {
    user,
    verifyStep,
    createDiditSession,
    checkDiditStatus,
    sendVerificationCode,
    verifyCode
  } = useAuth();

  const [step, setStep] = useState<Step>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [emailCode, setEmailCode] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneStep, setPhoneStep] = useState<"input" | "otp">("input");
  const [phoneCode, setPhoneCode] = useState("");
  const [countryCode, setCountryCode] = useState("+973");
  const [countries, setCountries] = useState<{ name: string, code: string, flag: string }[]>([
    { name: "Bahrain", code: "+973", flag: "https://flagcdn.com/bh.svg" }
  ]);

  const [diditSessionId, setDiditSessionId] = useState<string | null>(null);
  const [diditLoading, setDiditLoading] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (step === "success") {
      const timer = setTimeout(() => setShowCelebration(true), 1500);
      return () => clearTimeout(timer);
    } else {
      setShowCelebration(false);
    }
  }, [step]);

  useEffect(() => {
    let mounted = true;
    fetch("https://restcountries.com/v3.1/all?fields=name,idd,flags")
      .then(res => res.json())
      .then((data) => {
        if (!mounted) return;
        const formatted = data
          .filter((c: any) => c.idd && c.idd.root)
          .map((c: any) => ({
            name: c.name?.common || "Unknown",
            code: `${c.idd.root}${c.idd.suffixes?.[0] || ""}`,
            flag: c.flags?.svg || c.flags?.png || ""
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));

        const unique = formatted.filter((v: any, i: number, a: any) => a.findIndex((t: any) => (t.code === v.code && t.name === v.name)) === i);
        setCountries(unique);
      })
      .catch((err) => console.error("Could not fetch countries", err));
    return () => { mounted = false; };
  }, []);

  const handleNext = () => {
    if (step === "overview") setStep("email");
    else if (step === "email") setStep("phone");
    else if (step === "phone") setStep("profile");
    else if (step === "profile") setStep("success");
    else onClose();
  };

  const handleSendEmailCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await sendVerificationCode("email-verification");
    setLoading(false);
    if (!result.ok) {
      setError(result.error || "Failed to send verification code. Please try again.");
    }
  }, [sendVerificationCode]);

  useEffect(() => {
    if (step === "email" && isOpen) {
      handleSendEmailCode();
    }
  }, [step, isOpen, handleSendEmailCode]);

  const handleBack = () => {
    setStep("overview");
  };

  const verifyEmail = async () => {
    setLoading(true);
    setError(null);

    const verifyResult = await verifyCode(emailCode, "email-verification");
    if (!verifyResult.ok) {
      setError(verifyResult.error || "Invalid verification code");
      setLoading(false);
      return;
    }

    const result = await verifyStep("email", { code: emailCode });
    setLoading(false);
    if (result.ok) setStep("overview");
    else setError(result.error || "Email verification update failed");
  };

  const handleSendPhoneCode = async () => {
    setLoading(true);
    setError(null);
    const result = await sendVerificationCode("mobile-verification", {
      phone: `${countryCode}${phone.replace(/\\D/g, "")}`
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error || "Failed to send verification code. Please make sure the number is valid.");
    } else {
      setPhoneStep("otp");
    }
  };

  const verifyPhoneOtp = async () => {
    setLoading(true);
    setError(null);

    const verifyResult = await verifyCode(phoneCode, "mobile-verification");
    if (!verifyResult.ok) {
      setError(verifyResult.error || "Invalid verification code");
      setLoading(false);
      return;
    }

    const selectedCountry = countries.find(c => c.code === countryCode);
    const result = await verifyStep("mobile", {
      phone: `${countryCode}${phone.replace(/\\D/g, "")}`,
      country: selectedCountry?.name || ""
    });
    setLoading(false);
    if (result.ok) {
      setStep("overview");
      setPhoneStep("input");
      setPhoneCode("");
    } else {
      setError(result.error || "Mobile verification update failed");
    }
  };

  const startDiditVerification = async () => {
    setDiditLoading(true);
    setError(null);

    try {
      const result = await createDiditSession();
      if (result.ok && result.url && result.sessionToken) {
        setDiditSessionId(result.sessionId || null);

        const DiditSdkModule = (await import('@didit-protocol/sdk-web')).default as any;
        const didit = DiditSdkModule.shared || DiditSdkModule;

        didit.onComplete = (sdkResult: any) => {
          if (sdkResult.type === "completed") {
            void pollDiditStatus();
          } else if (sdkResult.type === "cancelled") {
            setError("Verification cancelled. You can try again later.");
            setDiditLoading(false);
          } else {
            setError(sdkResult.error?.message || "Verification encountered an error.");
            setDiditLoading(false);
          }
        };

        didit.onStateChange = (state: string, sdkError?: string) => {
          if (state === "error") {
            setError(sdkError || "Verification encountered an error.");
            setDiditLoading(false);
          }
        };

        await didit.startVerification({ url: result.url });
      } else {
        setError(result.error || "Failed to start Didit verification");
        setDiditLoading(false);
      }
    } catch (e: any) {
      console.error("Didit SDK Load Error:", e);
      setError("Failed to load Didit SDK: " + e.message);
      setDiditLoading(false);
    }
  };

  const pollDiditStatus = useCallback(async () => {
    if (!diditSessionId) return;
    setLoading(true);
    const result = await checkDiditStatus(diditSessionId);
    if (result.ok && result.status === "completed") {
      setStep("success");
    } else if (result.status === "failed") {
      // Show the exact rejection reason from the backend identity check
      setError(result.error || "Verification was declined or failed. Please try again.");
      setDiditSessionId(null);
    }
    setLoading(false);
  }, [diditSessionId, checkDiditStatus]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    // Set up cross-window message listener for desktop popups
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "didit-complete") {
        void pollDiditStatus();
      }
    };
    window.addEventListener("message", handleMessage);
    
    // Set up automatic background polling for mobile-phone QR code workflows
    if (diditSessionId && step !== "success") {
      interval = setInterval(() => {
        void pollDiditStatus();
      }, 5000);
    }
    
    return () => {
      window.removeEventListener("message", handleMessage);
      if (interval) clearInterval(interval);
    };
  }, [pollDiditStatus, diditSessionId, step]);

  const isEmailDone = !!user?.emailVerified;
  const isMobileDone = !!user?.mobileVerified;
  const isProfileDone = !!user?.profileVerified;

  const handleHubNext = () => {
    if (!isEmailDone) setStep("email");
    else if (!isMobileDone) setStep("phone");
    else if (!isProfileDone) setStep("profile");
    else setStep("success");
  };

  const renderStep = () => {
    switch (step) {
      case "overview":
        if (isEmailDone && isMobileDone && isProfileDone) {
          return (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in duration-500">
              <div className="bg-primary/10 p-6 rounded-full border border-primary/20">
                <CheckCircle2 size={60} className="text-primary" />
              </div>
              <div className="space-y-2 pt-4">
                <h2 className="text-2xl font-bold text-foreground">Fully Verified</h2>
                <p className="text-muted-foreground text-sm font-medium">Your setup is complete.</p>
              </div>
              <Button
                onClick={onClose}
                className="mt-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 font-bold px-12 h-12 rounded-lg transition-all"
              >
                Start Trading
              </Button>
            </div>
          );
        }

        return (
          <div className="pt-2 pb-2 pr-2 animate-in fade-in slide-in-from-bottom-4 duration-300 relative z-10 w-full overflow-hidden">
            <div className="absolute left-[38px] top-[140px] bottom-[280px] w-[2px] bg-border z-0 hidden sm:block"></div>

            <div className="space-y-1.5 z-10 relative px-4 text-center">
              <h2 className="text-2xl font-bold text-foreground">Verify Details</h2>
              <p className="text-muted-foreground text-sm font-medium">Takes less than 5 minutes</p>
            </div>

            <div className="space-y-7 relative z-10 pt-8 pl-4 pr-2">
              <div className={cn("flex items-center gap-5 transition-opacity", isEmailDone ? "opacity-60" : "")}>
                <div className={cn("relative flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-full border", isEmailDone ? "bg-primary/10 border-primary/30" : "bg-muted border-border")}>
                  {isEmailDone ? <CheckCircle2 size={22} className="text-primary stroke-[2]" /> : <Mail size={22} className="text-foreground stroke-[1.5]" />}
                </div>
                <div className="space-y-0.5">
                  <p className={cn("font-bold text-base", isEmailDone ? "text-primary" : "text-foreground")}>1. Confirm email</p>
                  <p className="text-sm text-muted-foreground font-medium">{user?.email || "Email address"}</p>
                </div>
              </div>

              <div className={cn("flex items-center gap-5 transition-opacity", isMobileDone ? "opacity-60" : "")}>
                <div className={cn("relative flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-full border", isMobileDone ? "bg-primary/10 border-primary/30" : "bg-muted border-border")}>
                  {isMobileDone ? <CheckCircle2 size={22} className="text-primary stroke-[2]" /> : <Smartphone size={22} className="text-foreground stroke-[1.5]" />}
                </div>
                <div className="space-y-0.5">
                  <p className={cn("font-bold text-base", isMobileDone ? "text-primary" : "text-foreground")}>2. Confirm phone</p>
                  <p className="text-sm text-muted-foreground font-medium">Secure your account</p>
                </div>
              </div>

              <div className={cn("flex items-center gap-5 transition-opacity", isProfileDone ? "opacity-60" : "")}>
                <div className={cn("relative flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-full border", isProfileDone ? "bg-primary/10 border-primary/30" : "bg-muted border-border")}>
                  {isProfileDone ? <CheckCircle2 size={22} className="text-primary stroke-[2]" /> : <User size={22} className="text-foreground stroke-[1.5]" />}
                </div>
                <div className="space-y-0.5">
                  <p className={cn("font-bold text-base", isProfileDone ? "text-primary" : "text-foreground")}>3. Verify Identity</p>
                  <p className="text-sm text-muted-foreground font-medium">Seamless KYC processing</p>
                </div>
              </div>
            </div>

            <div className="mt-8 relative z-10 px-2">
              <div className="flex items-center justify-center py-5">
                <div className="w-full max-w-[280px] h-1 rounded-full bg-border flex items-center justify-between relative">
                  <div className={cn("w-3.5 h-3.5 rounded-full ring-4 ring-card transition-colors", "bg-primary")}></div>
                  <div className={cn("w-3.5 h-3.5 rounded-full ring-4 ring-card transition-colors", isEmailDone ? "bg-primary" : "bg-border")}></div>
                  <div className={cn("w-3.5 h-3.5 rounded-full ring-4 ring-card transition-colors", isMobileDone ? "bg-primary" : "bg-border")}></div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 pt-2 pb-4">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="font-semibold px-8 h-12 rounded-lg transition-all"
                >
                  Skip for now
                </Button>
                <Button
                  onClick={handleHubNext}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 font-bold px-10 h-12 rounded-lg transition-all"
                >
                  {!isEmailDone ? "Verify Email" : !isMobileDone ? "Verify Phone" : "Verify Identity"}
                </Button>
              </div>

              <div className="flex flex-col items-center justify-center pt-3 pb-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium bg-muted px-4 py-1.5 rounded-full border border-border">
                  <Shield size={14} className="text-primary stroke-[2]" />
                  End-to-End Encrypted
                </div>
              </div>
            </div>
          </div>
        );

      case "email":
        return (
          <div className="space-y-6 pt-2 pb-2 px-2 sm:px-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-1.5 text-center">
              <h2 className="text-2xl font-bold text-foreground">Verify Email</h2>
              <p className="text-sm text-muted-foreground font-medium">We&apos;ve sent a code to <span className="text-foreground font-semibold">{user?.email}</span></p>
            </div>

            <div className="space-y-4 pt-6 max-w-sm mx-auto">
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded border border-destructive/20 mb-2 font-medium">
                  {error}
                </div>
              )}
              <Input
                placeholder="Enter 6-digit code"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                className="h-14 text-center text-xl font-bold tracking-[0.3em] bg-background border-input text-foreground focus-visible:ring-1 focus-visible:ring-primary rounded-lg placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSendEmailCode}
                disabled={loading}
                className="w-full text-primary p-0 h-auto hover:bg-transparent hover:text-primary/80 font-semibold pt-4"
              >
                {loading ? "Sending..." : "Resend code"}
              </Button>
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between pt-6 border-t border-border pb-2">
                <Button variant="ghost" onClick={handleBack} disabled={loading} className="flex items-center gap-2 text-muted-foreground hover:text-foreground px-2 font-medium">
                  <ArrowLeft size={16} className="stroke-[2]" />
                  Back
                </Button>
                <Button
                  onClick={verifyEmail}
                  disabled={loading || emailCode.length < 4}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 font-bold px-10 h-10 rounded-lg transition-all min-w-[130px]"
                >
                  {loading ? "Verifying..." : "Continue"}
                </Button>
              </div>
            </div>
          </div>
        );

      case "phone":
        return (
          <div className="space-y-6 pt-2 pb-2 px-2 sm:px-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-1.5 text-center">
              <h2 className="text-2xl font-bold text-foreground">Verify Phone</h2>
              <p className="text-sm text-muted-foreground font-medium">
                {phoneStep === "input" ? "We'll send a WhatsApp verification text" : `Code sent to WhatsApp ${countryCode}${phone}`}
              </p>
            </div>

            <div className="space-y-4 pt-6 max-w-sm mx-auto">
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded border border-destructive/20 mb-2 font-medium">
                  {error}
                </div>
              )}
              {phoneStep === "input" ? (
                <div className="flex items-center gap-0 border border-input bg-background rounded-xl overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50 transition-all relative z-50 shadow-sm">
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger className="w-auto h-12 flex-shrink-0 border-0 bg-transparent rounded-none focus:ring-0 focus:ring-offset-0 text-foreground font-medium flex items-center gap-2 pl-3 pr-2 hover:bg-muted/50 transition-colors">
                      {countries.find(c => c.code === countryCode)?.flag ? (
                        <img src={countries.find(c => c.code === countryCode)?.flag!} alt="flag" className="w-6 h-4 object-cover rounded shadow-sm" />
                      ) : (
                        <span className="text-lg">🌍</span>
                      )}
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto">
                      {countries.map((c) => (
                        <SelectItem key={`${c.name}-${c.code}`} value={c.code} className="cursor-pointer py-2">
                          <span className="flex items-center gap-2">
                            {c.flag ? (
                              <img src={c.flag} alt={c.name} className="w-5 h-4 object-cover rounded shadow-sm" />
                            ) : (
                              <span className="text-base">🌍</span>
                            )}
                            <span className="text-xs text-muted-foreground w-full max-w-[120px] truncate">{c.name}</span>
                            <span>{c.code}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center h-12 text-foreground font-medium pl-1 pr-1 border-l border-border/50">
                    {countryCode}
                  </div>
                  <Input
                    placeholder="8714256603"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="border-none h-12 text-base text-foreground font-medium focus-visible:ring-0 bg-transparent rounded-none placeholder:text-muted-foreground/50 px-2 w-full"
                    type="tel"
                  />
                </div>
              ) : (
                <div className="space-y-4 max-w-sm mx-auto animate-in zoom-in-95 duration-300">
                  <Input
                    placeholder="Enter code"
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value)}
                    className="h-14 text-center text-xl font-bold tracking-[0.3em] bg-background border-input text-foreground focus-visible:ring-1 focus-visible:ring-primary rounded-lg placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:tracking-normal w-full"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSendPhoneCode}
                    disabled={loading}
                    className="w-full text-primary p-0 h-auto hover:bg-transparent hover:text-primary/80 font-semibold pt-4"
                  >
                    {loading ? "Sending WhatsApp..." : "Resend code"}
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between pt-6 border-t border-border pb-2">
                <Button variant="ghost" onClick={() => {
                  if (phoneStep === "otp") setPhoneStep("input");
                  else handleBack();
                }} disabled={loading} className="flex items-center gap-2 text-muted-foreground hover:text-foreground px-2 font-medium">
                  <ArrowLeft size={16} className="stroke-[2]" />
                  Back
                </Button>
                {phoneStep === "input" ? (
                  <Button
                    onClick={handleSendPhoneCode}
                    disabled={loading || phone.replace(/\\D/g, '').length < 10}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 font-bold px-10 h-10 rounded-lg transition-all min-w-[130px]"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : "Continue"}
                  </Button>
                ) : (
                  <Button
                    onClick={verifyPhoneOtp}
                    disabled={loading || phoneCode.length < 4}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 font-bold px-10 h-10 rounded-lg transition-all min-w-[130px]"
                  >
                    {loading ? "Verifying..." : "Verify"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );

      case "profile":
        return (
          <div className="space-y-6 pt-2 pb-2 px-2 sm:px-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-1.5 text-center">
              <h2 className="text-2xl font-bold text-foreground">Identity Scan</h2>
              <p className="text-sm text-muted-foreground font-medium">Using Didit for secure ID processing.</p>
            </div>

            <div className="bg-muted border border-border p-8 rounded-xl space-y-4 text-center mt-6">
              {error && !diditSessionId ? (
                <div className="animate-in zoom-in-95 duration-300 space-y-5">
                  <div className="flex justify-center">
                    <div className="bg-destructive/10 p-4 rounded-full border border-destructive/20">
                      <X size={36} className="text-destructive" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-destructive">Verification Rejected</h3>
                    <p className="text-sm text-muted-foreground font-medium leading-relaxed max-w-xs mx-auto">
                      {error}
                    </p>
                  </div>
                  <div className="pt-2 space-y-3">
                    <p className="text-xs text-muted-foreground/70 font-medium">
                      Please ensure the name on your ID document matches your registered account name exactly.
                    </p>
                    <Button
                      onClick={() => { setError(null); setDiditLoading(false); }}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 font-bold px-10 h-12 rounded-lg transition-all flex items-center justify-center gap-3"
                    >
                      <ShieldCheck size={20} className="stroke-[2]" />
                      Try Again
                    </Button>
                  </div>
                </div>
              ) : error && diditSessionId ? (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded border border-destructive/20 mb-4 font-medium text-center">
                  {error}
                </div>
              ) : null}

              {!error && !diditSessionId ? (
                <div className="space-y-6">
                  <p className="text-sm text-muted-foreground font-medium">Email and phone verified. Proceed to document match.</p>
                  <Button
                    onClick={startDiditVerification}
                    disabled={diditLoading}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 font-bold px-10 h-12 rounded-lg transition-all flex items-center justify-center gap-3"
                  >
                    {diditLoading ? "Connecting..." : (
                      <>
                        <ShieldCheck size={20} className="stroke-[2]" />
                        Open Didit
                      </>
                    )}
                  </Button>
                </div>
              ) : !error && diditSessionId ? (
                <div className="space-y-5 text-center py-4">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-t-2 border-primary"></div>
                  </div>
                  <p className="font-bold text-foreground text-base">Awaiting Didit...</p>
                  <p className="text-sm text-muted-foreground font-medium">Complete the process in the external window.</p>

                  <Button
                    variant="outline"
                    onClick={pollDiditStatus}
                    disabled={loading}
                    className="mt-6 font-medium rounded-lg px-8"
                  >
                    {loading ? "Checking..." : "Refresh Status"}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between pt-6 border-t border-border pb-2">
                <Button variant="ghost" onClick={handleBack} disabled={loading || diditLoading} className="flex items-center gap-2 text-muted-foreground hover:text-foreground px-2 font-medium">
                  <ArrowLeft size={16} className="stroke-[2]" />
                  Back
                </Button>
              </div>
            </div>
          </div>
        );

      case "success":
        return (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in duration-500 min-h-[300px]">
            {showCelebration && typeof window !== "undefined" && (
              <div className="fixed inset-0 z-[99999] pointer-events-none" style={{ width: '100vw', height: '100vh', top: 0, left: 0 }}>
                <Confetti
                  width={window.innerWidth}
                  height={window.innerHeight}
                  colors={["#10b981", "#059669", "#FDE08B", "#eab308", "#171717", "#262626"]}
                  recycle={false}
                  numberOfPieces={500}
                  gravity={0.15}
                  initialVelocityY={20}
                />
              </div>
            )}

            {!showCelebration ? (
              <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-300">
                <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                <h2 className="text-xl font-bold text-foreground animate-pulse">Processing...</h2>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in duration-700 w-full relative z-10">
                <div className="bg-primary/10 p-6 rounded-full border border-primary/20 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                  <CheckCircle2 size={68} className="text-primary drop-shadow-[0_0_15px_rgba(16,185,129,0.6)]" />
                </div>
                <div className="space-y-3 pt-4">
                  <h2 className="text-3xl font-black text-foreground tracking-tight drop-shadow-sm">Identity Verified!</h2>
                  <p className="text-muted-foreground text-sm font-medium leading-relaxed max-w-[260px] mx-auto">
                    Welcome to the Inner Circle.
                  </p>
                </div>
                <Button
                  onClick={onClose}
                  className="mt-8 bg-gradient-to-r from-primary to-primary/80 hover:brightness-110 text-primary-foreground shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] font-bold px-12 h-14 rounded-xl transition-all active:scale-95 z-10 uppercase tracking-widest text-xs"
                >
                  Enter Dashboard
                </Button>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px] p-6 lg:p-8 overflow-hidden bg-card border border-border shadow-2xl rounded-2xl">
        <DialogHeader className="hidden">
          <DialogTitle>Verification</DialogTitle>
        </DialogHeader>
        {renderStep()}
      </DialogContent>
    </Dialog>
  );
}
