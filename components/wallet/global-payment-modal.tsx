"use client";

import { Copy, ExternalLink, QrCode, Clock } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTradingStore } from "@/store/trading-store";
import { useToastStore } from "@/store/toast-store";

export function GlobalPaymentModal() {
    const { paymentDetails, setPaymentDetails, selectedCrypto } = useTradingStore();
    const { addToast } = useToastStore();

    const handleCopy = (text: string, type: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        addToast(`${type} copied to clipboard`, "success");
    };

    return (
        <Dialog open={!!paymentDetails} onOpenChange={(open) => !open && setPaymentDetails(null)}>
            <DialogContent className="sm:max-w-[850px] p-0 overflow-hidden bg-[#161618] border border-border/40 shadow-2xl rounded-2xl animate-in zoom-in-[0.98] duration-300">
                <DialogHeader className="hidden">
                    <DialogTitle>Secure Cryptographic Gateway</DialogTitle>
                    <DialogDescription>Process deposit securely via CoinPayments network.</DialogDescription>
                </DialogHeader>

                {paymentDetails && (
                    <div className="flex flex-col md:flex-row h-full">
                        {/* Left Panel: QR Code & Status */}
                        <div className="w-full md:w-[360px] bg-[#111113] border-b md:border-b-0 md:border-r border-border/10 p-10 flex flex-col items-center justify-center relative overflow-hidden shrink-0">
                            {/* Subtle Ambient Glow */}
                            <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-[#FDE08B]/[0.03] rounded-full blur-[80px] pointer-events-none" />
                            <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-success/[0.03] rounded-full blur-[80px] pointer-events-none" />

                            <div className="relative z-10 w-full flex flex-col items-center gap-10">
                                {/* Network Status Badge */}
                                <div className="flex flex-col items-center gap-2">
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20 text-success">
                                        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-success/90">Awaiting Deposit</span>
                                    </div>
                                    <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.2em]">Secure Node Connected</span>
                                </div>

                                {/* QR Code Frame */}
                                <div className="relative p-[3px] rounded-[1.25rem] bg-gradient-to-br from-[#FDE08B]/30 via-border/10 to-transparent shadow-xl">
                                    <div className="p-4 bg-[#f8faf7] rounded-xl flex items-center justify-center">
                                        {paymentDetails.qrcode_url ? (
                                            <img
                                                src={paymentDetails.qrcode_url}
                                                alt="Payment QR"
                                                className="w-[180px] h-[180px] brightness-95 contrast-125 rendering-pixelated"
                                            />
                                        ) : (
                                            <div className="w-[180px] h-[180px] flex items-center justify-center bg-muted/10 rounded-lg">
                                                <QrCode className="w-16 h-16 text-muted-foreground/30" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <p className="text-[12px] text-muted-foreground/60 text-center font-medium max-w-[240px] leading-relaxed">
                                    Scan with your cryptocurrency wallet application to automatically input these parameters.
                                </p>
                            </div>
                        </div>

                        {/* Right Panel: Transaction Details */}
                        <div className="flex-1 p-10 flex flex-col justify-center relative overflow-hidden">
                            {/* Background texture/glow */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-card/5 via-transparent to-transparent pointer-events-none" />

                            <div className="space-y-12 relative z-10 w-full max-w-[420px] mx-auto">
                                
                                {/* Amount Section */}
                                <div className="space-y-4 pt-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[11px] font-bold text-foreground/70 uppercase tracking-[0.15em]">Exact Amount Required</h4>
                                        <div className="flex items-center gap-1.5 text-[10px] text-[#FDE08B] font-bold bg-[#FDE08B]/10 border border-[#FDE08B]/20 px-2 py-0.5 rounded shadow-sm">
                                            <Clock className="w-3 h-3" />
                                            <span>Network Confirmations</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 group">
                                        <div className="flex items-baseline gap-2.5">
                                            <span className="text-4xl font-mono font-bold text-foreground tracking-tight select-none drop-shadow-sm">
                                                {paymentDetails.amount}
                                            </span>
                                            <span className="text-xl font-bold text-[#FDE08B]">{selectedCrypto}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(paymentDetails.amount, "Amount")}
                                            className="p-2.5 rounded-lg bg-[#111113] border border-border/40 text-muted-foreground hover:text-[#FDE08B] hover:border-[#FDE08B]/40 hover:bg-[#FDE08B]/10 transition-all outline-none"
                                            title="Copy exact amount"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <p className="text-[12px] text-rose-400 font-semibold tracking-wide">
                                        * Send exactly this amount to prevent payment delays.
                                    </p>
                                </div>

                                {/* Divider */}
                                <div className="h-px w-full bg-border/20" />

                                {/* Address Section */}
                                <div className="space-y-4 pb-4">
                                    <h4 className="text-[11px] font-bold text-foreground/70 uppercase tracking-[0.15em]">Destination Address</h4>
                                    <div className="relative group">
                                        <div className="flex items-center w-full bg-card/60 border border-border/50 rounded-xl p-4 pr-16 group-hover:border-[#FDE08B]/40 transition-colors shadow-inner">
                                            <span className="text-[15px] font-mono text-foreground break-all select-all font-semibold leading-relaxed transition-colors">
                                                {paymentDetails.address}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(paymentDetails.address, "Address")}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-background border border-border/40 text-muted-foreground shadow-sm hover:text-[#FDE08B] hover:border-[#FDE08B]/40 hover:bg-[#FDE08B]/10 transition-all outline-none"
                                            title="Copy deposit address"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Footer Actions */}
                                <div className="grid grid-cols-[1fr_1.5fr] gap-4 pt-6">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => window.open(paymentDetails.status_url, "_blank")}
                                        className="h-12 bg-transparent border-border/40 text-foreground hover:border-[#FDE08B]/60 hover:bg-[#FDE08B]/5 hover:text-[#FDE08B] transition-all rounded-xl font-bold text-xs tracking-wide shadow-sm"
                                    >
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Details
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={() => setPaymentDetails(null)}
                                        className="h-12 bg-gradient-to-r from-[#FDE08B] to-[#D5E19A] text-[#111113] hover:opacity-90 rounded-xl font-bold shadow-[0_4px_14px_rgba(213,225,154,0.25)] transition-all text-sm tracking-widest uppercase border border-transparent active:scale-[0.98]"
                                    >
                                        Return to Dashboard
                                    </Button>
                                </div>
                                
                                <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40 pt-4">
                                    Secured by CoinPayments API
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
