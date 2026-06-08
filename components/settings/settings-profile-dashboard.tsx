"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, User, HelpCircle, XCircle, ShieldCheck, Check, AlertOctagon, BadgeCheck, Shield, FileWarning, CreditCard, Globe, Landmark, BarChart3 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SettingsProfileDashboard() {
  const { user } = useAuth();
  const isFullyVerified = !!user?.profileVerified;
  
  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account details and verification status</p>
      </div>

      {/* Account Overview Cards */}
      <div className="space-y-5">
        <h2 className="text-lg font-bold tracking-tight">Account overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Status Card */}
          <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-violet-500/30 hover:shadow-xl hover:shadow-violet-500/5 transition-all duration-300 flex flex-col">
            <div className="h-32 bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-violet-500/10 blur-xl" />
              <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-violet-500/15 border border-violet-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-violet-500/10 transition-all duration-300">
                <BadgeCheck className="h-7 w-7 text-violet-400" />
              </div>
            </div>
            <div className="p-5 flex flex-col flex-grow">
              <h3 className="font-bold text-sm mb-1.5">Account Status</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Your current verification level and account standing.</p>
              <div className="flex items-center gap-2 text-xs font-semibold bg-muted/30 rounded-lg px-3 py-2.5 border border-border/50 mt-auto">
                <BadgeCheck className={`h-3.5 w-3.5 ${isFullyVerified ? "text-emerald-400" : "text-amber-400"}`} />
                <span className={isFullyVerified ? "text-emerald-400" : "text-amber-400"}>
                  {isFullyVerified ? "Fully Verified" : "Verified (Basic)"}
                </span>
                {!isFullyVerified && (
                  <span className="text-muted-foreground font-normal ml-auto">2/3 steps</span>
                )}
              </div>
            </div>
          </Card>

          {/* Deposit Limit Card */}
          <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/5 transition-all duration-300 flex flex-col">
            <div className="h-32 bg-gradient-to-br from-cyan-500/15 via-cyan-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-cyan-500/10 blur-xl" />
              <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-cyan-500/10 transition-all duration-300">
                <CreditCard className="h-7 w-7 text-cyan-400" />
              </div>
            </div>
            <div className="p-5 flex flex-col flex-grow">
              <h3 className="font-bold text-sm mb-1.5">Deposit Limit</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Your current deposit limit based on verification level.</p>
              <div className="flex items-center gap-2 text-xs font-semibold bg-muted/30 rounded-lg px-3 py-2.5 border border-border/50 mt-auto">
                <CreditCard className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-lg font-bold">{isFullyVerified ? "Unlimited" : "0 USD"}</span>
              </div>
            </div>
          </Card>

          {/* Verify Account CTA Card */}
          {!isFullyVerified ? (
            <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 flex flex-col">
              <div className="h-32 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
                <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-emerald-500/10 blur-xl" />
                <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-emerald-500/10 transition-all duration-300">
                  <Shield className="h-7 w-7 text-emerald-400" />
                </div>
              </div>
              <div className="p-5 flex flex-col flex-grow">
                <h3 className="font-bold text-sm mb-1.5">Complete Verification</h3>
                <p className="text-xs text-muted-foreground mb-4 flex-grow leading-relaxed">
                  Verify your address to unlock unlimited deposits and full features.
                </p>
                <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg gap-1.5 shadow-md shadow-emerald-500/20 h-8 text-xs w-fit">
                  <Shield className="h-3 w-3" /> Verify now
                </Button>
              </div>
            </Card>
          ) : (
             <Card className="group overflow-hidden rounded-2xl border-emerald-500/30 bg-emerald-500/5 transition-all duration-300 flex flex-col">
              <div className="h-32 bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 via-transparent to-transparent" />
                <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-emerald-500/20 blur-xl" />
                <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-emerald-500/20 transition-all duration-300">
                  <ShieldCheck className="h-7 w-7 text-emerald-400" />
                </div>
              </div>
              <div className="p-5 flex flex-col flex-grow">
                <h3 className="font-bold text-sm mb-1.5 text-emerald-500">All Features Unlocked</h3>
                <p className="text-xs text-emerald-500/70 mb-4 flex-grow leading-relaxed">
                  Your identity is fully verified. You have instant access to all premium platform features.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Verification Steps */}
      <div>
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-400" /> Verification steps
        </h2>

        <div className="rounded-2xl border border-border/40 bg-card/50 overflow-hidden">
          {/* Step 1 */}
          <div className="flex items-center justify-between p-5 border-b border-border/30 hover:bg-muted/5 transition-colors">
            <div className="flex items-center gap-4">
              <div className={`h-8 w-8 rounded-lg ${user?.emailVerified ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-muted text-muted-foreground'} flex items-center justify-center text-xs font-bold shadow-sm`}>
                {user?.emailVerified ? <Check className="h-4 w-4" /> : "1"}
              </div>
              <div>
                <p className="text-sm font-semibold">Personal details</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {user?.email || "No email"}{user?.phone ? `, ${user.phone}` : ""}
                </p>
              </div>
            </div>
            {user?.emailVerified ? (
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 px-3 py-1 rounded-full">Verified</span>
            ) : (
              <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/15 px-3 py-1 rounded-full">Pending</span>
            )}
          </div>

          {/* Step 2 */}
          <div className="flex items-center justify-between p-5 border-b border-border/30 hover:bg-muted/5 transition-colors">
            <div className="flex items-center gap-4">
              <div className={`h-8 w-8 rounded-lg ${isFullyVerified ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-muted text-muted-foreground'} flex items-center justify-center text-xs font-bold shadow-sm`}>
                {isFullyVerified ? <Check className="h-4 w-4" /> : "2"}
              </div>
              <div>
                <p className="text-sm font-semibold">Identity verification</p>
                <p className="text-xs text-muted-foreground mt-0.5 uppercase">{user?.name?.toUpperCase() || "NOT SET"}</p>
              </div>
            </div>
            {isFullyVerified ? (
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 px-3 py-1 rounded-full">Verified</span>
            ) : (
              <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/15 px-3 py-1 rounded-full">Pending</span>
            )}
          </div>

          {/* Step 3 */}
          {!isFullyVerified ? (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="h-8 w-8 rounded-lg bg-red-500/15 border border-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold">3</div>
                  <p className="text-sm font-semibold">Residential address verification</p>
                </div>
                <span className="text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/15 px-3 py-1 rounded-full">Rejected</span>
              </div>

              <div className="ml-12 space-y-5">
                <div>
                  <p className="text-xs text-muted-foreground">Provide proof of your place of residence</p>
                  <p className="text-sm font-semibold mt-1">{user?.country || 'Not setup'}</p>
                </div>

                {/* Features & Limits */}
                <div className="rounded-xl border border-border/30 bg-muted/5 p-4">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Features and limits</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { icon: CreditCard, label: "Unlimited deposits" },
                      { icon: Globe, label: "Global and local payment methods" },
                      { icon: Landmark, label: "Bank card and crypto payments" },
                      { icon: BarChart3, label: "Trading" },
                    ].map((feature) => (
                      <div key={feature.label} className="flex items-center gap-2.5 text-sm text-foreground/80">
                        <feature.icon className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        {feature.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Warning */}
                <div className="rounded-xl bg-red-500/8 border border-red-500/15 p-4 flex items-start gap-3">
                  <FileWarning className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300/80">
                    Full address not detected. Please make sure the document contains your full name and address and has been issued within the last 6 months. Follow the instructions on the next screen to <span className="text-blue-400 cursor-pointer hover:underline">try again</span>
                  </p>
                </div>

                {/* Verify Dialog */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg px-6 h-9 text-sm shadow-md shadow-emerald-500/15">
                      Verify now
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[550px] p-0 flex flex-col gap-0 overflow-hidden rounded-2xl border-border/50">
                    <DialogHeader className="p-6 pb-2">
                      <DialogTitle className="text-xl font-bold">Verify documents</DialogTitle>
                      <DialogDescription className="text-sm pt-3 leading-relaxed text-muted-foreground">
                        Some of your documents don&apos;t meet all requirements. Please check details below and upload new files.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col px-6 pb-6 pt-2">
                      <div className="flex justify-start mb-3">
                        <div className="h-14 w-14 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                          <AlertOctagon className="h-8 w-8 text-red-400" strokeWidth={2} />
                        </div>
                      </div>
                      <h3 className="text-lg font-bold mb-3">Proof of residence</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground mb-1">
                        Sorry, we can&apos;t accept the document you sent us because it didn&apos;t include your full address.
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground mb-1">
                        A valid proof of address document should include your name and full address. It can be any of the following:
                      </p>
                      <ul className="text-sm leading-relaxed text-muted-foreground space-y-1.5 mt-2 mb-6 list-none">
                        <li className="flex items-start gap-2"><span className="text-emerald-400 mt-1.5">•</span> Utility bill (e.g. phone, gas, water, electric, internet or cable bill - issued in the last 6 months)</li>
                        <li className="flex items-start gap-2"><span className="text-emerald-400 mt-1.5">•</span> Bank statement, bank account confirmation letter, credit card statement (issued in the last 6 months)</li>
                        <li className="flex items-start gap-2"><span className="text-emerald-400 mt-1.5">•</span> Government-issued document that includes your address e.g. ID Card, driving license.</li>
                      </ul>
                      <div className="flex justify-end mt-auto">
                        <Button className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg px-6 h-10 text-sm shadow-md shadow-emerald-500/15">
                          Submit a new document
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-5 border-b border-border/30 hover:bg-muted/5 transition-colors">
              <div className="flex items-center gap-4">
                <div className="h-8 w-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shadow-sm shadow-emerald-500/20">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Residential address verification</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Verified Identity Document</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 px-3 py-1 rounded-full">Verified</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
