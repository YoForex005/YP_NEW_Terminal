"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Eye, Check, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { DashboardSnapshot, TradingAccount } from "@/types/dashboard";
import { useToastStore } from "@/store/toast-store";
import { useTradingStore } from "@/store/trading-store";

interface ChangePasswordModalProps {
    isOpen: boolean;
    onClose: () => void;
    account: TradingAccount | null;
}

type PasswordType = "trading" | "investor" | null;

interface ChangePasswordApiResponse {
    ok?: boolean;
    message?: string;
    error?: string;
    snapshot?: DashboardSnapshot;
}

export function ChangePasswordModal({ isOpen, onClose, account }: ChangePasswordModalProps) {
    const [step, setStep] = useState(1);
    const [passwordType, setPasswordType] = useState<PasswordType>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Form States
    const [verificationCode, setVerificationCode] = useState("");
    const [maskedEmail, setMaskedEmail] = useState("");
    const [verifyError, setVerifyError] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const { addToast } = useToastStore();
    const { hydrateFromSnapshot } = useTradingStore();

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setPasswordType(null);
            setVerificationCode("");
            setMaskedEmail("");
            setVerifyError("");
            setNewPassword("");
            setConfirmPassword("");
            setIsLoading(false);
        }
    }, [isOpen]);

    const sendVerificationCode = async (): Promise<boolean> => {
        try {
            const res = await fetch("/api/private/verification", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "send-code", purpose: "password-change" }),
            });
            const payload = await res.json();
            if (payload.ok && payload.maskedEmail) {
                setMaskedEmail(payload.maskedEmail);
                return true;
            } else {
                addToast(payload.error || "Failed to send verification code.", "error");
                return false;
            }
        } catch {
            addToast("Network error. Please try again.", "error");
            return false;
        }
    };

    const verifyCode = async (): Promise<boolean> => {
        try {
            const res = await fetch("/api/private/verification", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "verify-code", purpose: "password-change", code: verificationCode }),
            });
            const payload = await res.json();
            if (payload.ok && payload.verified) {
                setVerifyError("");
                return true;
            } else {
                setVerifyError(payload.error || "Invalid verification code.");
                return false;
            }
        } catch {
            setVerifyError("Network error. Please try again.");
            return false;
        }
    };

    const handleResendCode = async () => {
        setIsLoading(true);
        setVerifyError("");
        const sent = await sendVerificationCode();
        if (sent) addToast("New verification code sent to your email!", "success");
        setIsLoading(false);
    };

    const handleNext = async () => {
        if (step === 1 && !passwordType) return;

        setIsLoading(true);

        // Step 1 → 2: send verification code to user's email
        if (step === 1) {
            const sent = await sendVerificationCode();
            if (!sent) {
                setIsLoading(false);
                return;
            }
            setIsLoading(false);
            setStep(2);
            return;
        }

        // Step 2 → 3: verify the 6-digit code
        if (step === 2) {
            const valid = await verifyCode();
            if (!valid) {
                setIsLoading(false);
                return;
            }
            setIsLoading(false);
            setStep(3);
            return;
        }

        if (step === 3 && account && passwordType) {
            const response = await fetch(`/api/private/accounts/${account.id}/password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    passwordType,
                    newPassword,
                }),
            });

            let payload: ChangePasswordApiResponse = {};
            try {
                payload = (await response.json()) as ChangePasswordApiResponse;
            } catch {
                payload = {};
            }

            if (payload.snapshot) {
                hydrateFromSnapshot(payload.snapshot);
            }

            if (!response.ok) {
                addToast(payload.error ?? payload.message ?? "Password update failed.", "error");
                setIsLoading(false);
                return;
            }

            addToast(payload.message ?? "Password updated successfully.", "success");
            setIsLoading(false);
            setStep(4);
            return;
        }

        setIsLoading(false);

        if (step < 4) {
            setStep(step + 1);
        } else {
            onClose();
        }
    };

    const handleBack = () => {
        if (step > 1) setStep(step - 1);
    };

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && account && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-40%" }}
                        animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                        exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-40%" }}
                        className="fixed left-1/2 top-1/2 w-full max-w-lg max-h-[90vh] flex flex-col bg-card rounded-2xl shadow-2xl z-50 overflow-hidden border border-border"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <div>
                                <div className="flex items-center gap-2">
                                    <div className="h-8 w-8 rounded-lg bg-primary/20 dark:bg-primary/10 flex items-center justify-center text-primary dark:text-primary">
                                        <Lock className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                                            Change Password
                                        </h2>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Account: {account.name} ({account.accountNumber})
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Server IP: {account.serverIp ?? "Not assigned"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                                onClick={onClose}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Stepper */}
                        <div className="px-6 py-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                            <div className="flex items-center justify-between relative">
                                {/* Connector Lines */}
                                <div className="absolute left-0 top-1/2 h-0.5 w-full bg-slate-200 dark:bg-slate-800 -z-10" />
                                <div
                                    className="absolute left-0 top-1/2 h-0.5 bg-primary -z-10 transition-all duration-500"
                                    style={{ width: `${((step - 1) / 3) * 100}%` }}
                                />

                                {/* Steps */}
                                {["Select Type", "Verify", "New Password", "Done"].map((label, i) => {
                                    const stepNum = i + 1;
                                    const isActive = step >= stepNum;

                                    return (
                                        <div key={stepNum} className="flex flex-col items-center gap-2 bg-muted/40 dark:bg-slate-900 px-2">
                                            <div
                                                className={cn(
                                                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300",
                                                    isActive
                                                        ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20"
                                                        : "bg-background border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-700"
                                                )}
                                            >
                                                {step > stepNum ? <Check className="h-4 w-4" /> : stepNum}
                                            </div>
                                            <span className={cn(
                                                "text-[10px] font-bold uppercase tracking-wider transition-colors duration-300",
                                                isActive ? "text-primary dark:text-primary" : "text-slate-400"
                                            )}>
                                                {label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="flex-1 overflow-y-auto min-h-[300px] p-6">
                            {step === 1 && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <h3 className="text-center font-bold text-slate-900 dark:text-white mb-6">Which password do you want to change?</h3>

                                    <button
                                        onClick={() => setPasswordType("trading")}
                                        className={cn(
                                            "w-full p-4 rounded-xl border-2 text-left transition-all duration-200 group relative overflow-hidden",
                                            passwordType === "trading"
                                                ? "border-primary bg-primary/5 dark:bg-primary/10 dark:border-primary"
                                                : "border-slate-200 dark:border-slate-800 hover:border-primary/30 dark:hover:border-primary/30 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                        )}
                                    >
                                        <div className="flex items-start gap-4 relative z-10">
                                            <div className={cn(
                                                "h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
                                                passwordType === "trading" ? "bg-primary/20 text-primary dark:bg-primary/10 dark:text-primary" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                                            )}>
                                                <Lock className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900 dark:text-white mb-1">Trading Password</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                                    Full access to trade and manage the account. Required for trading terminals.
                                                </div>
                                            </div>
                                            {passwordType === "trading" && (
                                                <div className="absolute top-0 right-0 p-2">
                                                    <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                                        <Check className="h-3 w-3" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => setPasswordType("investor")}
                                        className={cn(
                                            "w-full p-4 rounded-xl border-2 text-left transition-all duration-200 group relative overflow-hidden",
                                            passwordType === "investor"
                                                ? "border-primary bg-primary/5 dark:bg-primary/10 dark:border-primary"
                                                : "border-slate-200 dark:border-slate-800 hover:border-primary/20 dark:hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                        )}
                                    >
                                        <div className="flex items-start gap-4 relative z-10">
                                            <div className={cn(
                                                "h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
                                                passwordType === "investor" ? "bg-primary/20 text-primary dark:bg-primary/10 dark:text-primary" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                                            )}>
                                                <Eye className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-900 dark:text-white mb-1">Investor Password</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                                    Read-only access to view positions and trading history. Cannot trade.
                                                </div>
                                            </div>
                                            {passwordType === "investor" && (
                                                <div className="absolute top-0 right-0 p-2">
                                                    <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                                        <Check className="h-3 w-3" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                </div>
                            )}

                            {step === 2 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="text-center">
                                        <div className="h-16 w-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Lock className="h-8 w-8 text-blue-500" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Verify Identity</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-xs mx-auto">
                                            For security, please enter the verification code sent to your email <strong>{maskedEmail || "your registered email"}</strong>
                                        </p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label>Verification Code</Label>
                                            <Input
                                                value={verificationCode}
                                                onChange={(e) => { setVerificationCode(e.target.value); setVerifyError(""); }}
                                                placeholder="Enter 6-digit code"
                                                className={cn("text-center text-lg tracking-widest font-mono h-12", verifyError && "border-red-500")}
                                                maxLength={6}
                                            />
                                            {verifyError && (
                                                <p className="text-xs text-red-500 text-center">{verifyError}</p>
                                            )}
                                        </div>
                                        <div className="text-center">
                                            <button
                                                onClick={handleResendCode}
                                                disabled={isLoading}
                                                className="text-xs font-bold text-primary hover:text-primary/80 dark:hover:text-primary/80 disabled:opacity-50"
                                            >
                                                Resend Code
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}


                            {step === 3 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="text-center mb-2">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                            Set New {passwordType === 'trading' ? 'Trading' : 'Investor'} Password
                                        </h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            Choose a strong password for your account
                                        </p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label>New Password</Label>
                                            <Input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="h-11"
                                                placeholder="••••••••"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Confirm Password</Label>
                                            <Input
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className="h-11"
                                                placeholder="••••••••"
                                            />
                                        </div>

                                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-xs space-y-2 text-slate-500">
                                            <p className="font-bold text-slate-700 dark:text-slate-300">Password Requirements:</p>
                                            <ul className="list-disc pl-4 space-y-1">
                                                <li>Minimum 8 characters long</li>
                                                <li>At least one uppercase letter</li>
                                                <li>At least one number</li>
                                                <li>At least one special character</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 4 && (
                                <div className="flex flex-col items-center justify-center h-full py-8 animate-in fade-in zoom-in duration-300">
                                    <div className="h-20 w-20 bg-primary/20 dark:bg-primary/10 rounded-full flex items-center justify-center mb-6 text-primary">
                                        <Check className="h-10 w-10" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Password Changed!</h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-center max-w-xs mb-8">
                                        Your {passwordType === 'trading' ? 'Trading' : 'Investor'} Password has been successfully updated. You can now use it to login to your trading terminal.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                            {step < 4 ? (
                                <Button
                                    onClick={handleNext}
                                    disabled={
                                        isLoading ||
                                        (step === 1 && !passwordType) ||
                                        (step === 2 && verificationCode.length < 6) ||
                                        (step === 3 && (newPassword.length < 8 || newPassword !== confirmPassword))
                                    }
                                    className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 transition-all"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        "Continue"
                                    )}
                                </Button>
                            ) : (
                                <Button
                                    onClick={onClose}
                                    className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
                                >
                                    Done
                                </Button>
                            )}

                            {step > 1 && step < 4 && (
                                <button
                                    onClick={handleBack}
                                    disabled={isLoading}
                                    className="w-full mt-4 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                                >
                                    Back to previous step
                                </button>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
