"use client";

import { useState, useEffect } from "react";
import { AlertCircle, ChevronDown, Sparkles, ArrowLeft, Coins, CheckCircle2, QrCode, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletFooter } from "@/components/wallet/wallet-footer";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

export function CryptoDepositDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [cryptoCurrency, setCryptoCurrency] = useState("BTC");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [error, setError] = useState("");

  const handleDeposit = async () => {
    setError("");
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }

    if (!user) {
      setError("You must be logged in to make a deposit.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/payments/coinpayments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsedAmount,
          currency: "USD",
          cryptoCurrency: cryptoCurrency,
          ownerId: user.id,
          email: user.email,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || result.message || "Failed to initiate payment");

      setPaymentDetails(result.data);
      setSuccess(true);
      
      // Open the status URL in a new tab
      if (result.data.status_url) {
        window.open(result.data.status_url, "_blank");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-8">
      {/* Alert Banner — refined */}
      <div className="relative overflow-hidden bg-amber-500/8 border border-amber-500/20 p-5 rounded-2xl mx-0">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 w-full">
            <div className="shrink-0 mt-0.5 sm:mt-0 h-10 w-10 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Address Verification Required</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                Full address not detected. Please make sure the document contains your full name and address and has been issued within the last 6 months. Follow the instructions on the next screen to <a href="#" className="text-amber-400 hover:underline transition-colors">try again</a>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="bg-transparent border-border/50 hover:bg-muted/50 text-xs h-9 px-4 rounded-xl font-semibold">Learn more</Button>
            <Button size="sm" className="bg-amber-500 text-amber-950 hover:bg-amber-400 border-none font-bold text-xs h-9 px-5 rounded-xl shadow-lg shadow-amber-500/20">Complete profile</Button>
          </div>
        </div>
      </div>

      {/* Hero Banner — Emerald deposit theme */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-600/20 via-emerald-500/10 to-transparent border border-emerald-500/15 p-8 md:p-10">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-teal-500/5 rounded-full blur-2xl translate-y-1/2" />

        <div className="relative">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
                <Sparkles className="h-3 w-3" />
                CRYPTO DEPOSIT
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Deposit <span className="text-emerald-400">Funds</span>
              </h1>
              <p className="text-base text-muted-foreground max-w-md">
                Add funds to your trading account using cryptocurrency. Fast, secure, and with zero fees.
              </p>
            </div>

            <div className="flex gap-3 shrink-0">
              <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[80px]">
                <p className="text-xl font-bold text-emerald-400">0%</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Fees</p>
              </div>
              <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[80px]">
                <p className="text-xl font-bold text-emerald-400">~15m</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Avg time</p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <Link href="/wallet/deposits" className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              See all payment methods
            </Link>
          </div>
        </div>
      </div>

      {/* Payment Method Card */}
      <div className="max-w-xl">
        <div className="relative overflow-hidden rounded-2xl border border-border/30 shadow-lg bg-card">
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <Coins className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-bold text-foreground">Payment Method</h2>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] font-bold text-amber-500 uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Sandbox Mode
              </div>
            </div>

            {/* Sandbox Notice */}
            <div className="bg-amber-500/8 border border-amber-500/15 rounded-xl p-4 mb-2 animate-in fade-in slide-in-from-top-1 duration-500">
              <p className="text-xs leading-relaxed text-amber-500/90 font-medium">
                <span className="font-bold underline block mb-1">TEST ENVIRONMENT ENABLED</span>
                You are currently in <span className="font-bold uppercase tracking-tight">Sandbox/Simulation Mode</span>. No real cryptocurrency funds will be deducted from your personal wallets during this testing phase. Everything is safe to test.
              </p>
            </div>

            {/* Crypto Dropdown */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Cryptocurrency</label>
              <div className="relative">
                <select 
                  value={cryptoCurrency}
                  onChange={(e) => setCryptoCurrency(e.target.value)}
                  className="w-full flex items-center justify-between border border-border/40 hover:border-emerald-500/30 rounded-xl bg-muted/20 px-4 py-3 transition-all duration-200 appearance-none text-sm font-bold text-foreground focus:outline-none cursor-pointer"
                >
                  <option value="BTC" className="bg-card">Bitcoin (BTC)</option>
                  <option value="ETH" className="bg-card">Ethereum (ETH)</option>
                  <option value="USDT.ERC20" className="bg-card">Tether (USDT - ERC20)</option>
                  <option value="USDT.TRC20" className="bg-card">Tether (USDT - TRC20)</option>
                  <option value="LTC" className="bg-card">Litecoin (LTC)</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <ChevronDown className="w-4 h-4 text-muted-foreground opacity-60" />
                </div>
              </div>
            </div>

            {/* Deposit Form / Payment details */}
            {success && paymentDetails ? (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="relative overflow-hidden rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-6 flex flex-col items-center justify-center text-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-bold text-emerald-500">Payment Initiated</h3>
                  <p className="text-sm text-muted-foreground">Scan the QR code or pay manually. Your wallet will be credited once confirmed.</p>
                </div>

                <div className="bg-muted/10 border border-border/40 rounded-xl p-5 space-y-4">
                  <div className="flex flex-col items-center gap-4">
                    {paymentDetails.qrcode_url && (
                      <div className="bg-[#f8faf7] p-3 rounded-lg border border-border/20 shadow-sm">
                        <img src={paymentDetails.qrcode_url} alt="Payment QR Code" className="w-32 h-32" />
                      </div>
                    )}
                    <div className="w-full text-center space-y-1">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Send Exactly</p>
                      <p className="text-xl font-bold text-foreground font-mono">{paymentDetails.amount} {cryptoCurrency}</p>
                    </div>
                    <div className="w-full space-y-1.5">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Deposit Address</p>
                      <div className="flex items-center gap-2 bg-muted/30 p-3 rounded-lg border border-border/20 break-all text-[11px] font-mono select-all">
                        {paymentDetails.address}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <Button 
                      onClick={() => window.open(paymentDetails.status_url, "_blank")}
                      variant="outline"
                      className="w-full h-11 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Confirmation Page
                    </Button>
                    <Button 
                      onClick={() => { setSuccess(false); setPaymentDetails(null); }}
                      variant="ghost"
                      className="w-full h-11 text-muted-foreground hover:bg-muted/30 text-xs font-semibold rounded-xl"
                    >
                      Make Another Deposit
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deposit Amount (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="pl-8 h-12 text-lg rounded-xl border-border/40 bg-muted/20 focus-visible:ring-emerald-500/30 font-medium"
                    />
                  </div>
                  {error && <p className="text-xs text-rose-500 font-medium mt-1">{error}</p>}
                </div>

                <Button 
                  onClick={handleDeposit} 
                  disabled={isSubmitting || !amount}
                  className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 gap-2 mt-2"
                >
                  {isSubmitting ? "Processing..." : "Complete Deposit"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Legal Text Footer */}
      <div className="mt-auto pt-16 border-t border-border/20 w-full mb-10">
         <WalletFooter />
      </div>
      
    </div>
  );
}
