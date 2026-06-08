"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, Lock, Smartphone, KeyRound, ShieldAlert, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SecurityData {
  emailMasked: string;
  phoneMasked: string;
  twoFactorEnabled: boolean;
}

export function SettingsSecurityDashboard() {
  const [data, setData] = useState<SecurityData>({
    emailMasked: "f•••••t@gmail.com",
    phoneMasked: "+91••••5761",
    twoFactorEnabled: true,
  });

  useEffect(() => {
    fetch("/api/private/settings/security")
      .then(res => res.json())
      .then(resData => {
        if (resData.ok && resData.data) {
          setData(resData.data);
        }
      })
      .catch(console.error);
  }, []);

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Security</h1>
        <p className="text-sm text-muted-foreground">Manage your login credentials, verification, and device security</p>
      </div>

      {/* Security Overview Cards */}
      <div className="space-y-5">
        <h2 className="text-lg font-bold tracking-tight">Security overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Login Card */}
          <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/5 transition-all duration-300 flex flex-col">
            <div className="h-32 bg-gradient-to-br from-cyan-500/15 via-cyan-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-cyan-500/10 blur-xl" />
              <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-cyan-500/10 transition-all duration-300">
                <KeyRound className="h-7 w-7 text-cyan-400" />
              </div>
            </div>
            <div className="p-5 flex flex-col flex-grow">
              <h3 className="font-bold text-sm mb-1.5">Login Credentials</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Your registered email for logging in to FxTrusts.</p>
              <div className="flex items-center gap-2 text-xs font-semibold bg-muted/30 rounded-lg px-3 py-2.5 border border-border/50 mt-auto">
                <KeyRound className="h-3.5 w-3.5 text-cyan-400" />
                <span className="font-mono">{data.emailMasked}</span>
              </div>
            </div>
          </Card>

          {/* Password Card */}
          <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-violet-500/30 hover:shadow-xl hover:shadow-violet-500/5 transition-all duration-300 flex flex-col">
            <div className="h-32 bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-violet-500/10 blur-xl" />
              <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-violet-500/15 border border-violet-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-violet-500/10 transition-all duration-300">
                <Lock className="h-7 w-7 text-violet-400" />
              </div>
            </div>
            <div className="p-5 flex flex-col flex-grow">
              <h3 className="font-bold text-sm mb-1.5">Password</h3>
              <p className="text-xs text-muted-foreground mb-4 flex-grow leading-relaxed">
                Change your password whenever you think it might have been compromised.
              </p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg gap-1.5 shadow-md shadow-emerald-500/20 h-8 text-xs w-fit">
                    <Lock className="h-3 w-3" /> Change password
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] rounded-2xl border-border/50">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold">Change Password</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                      Update your password to keep your account secure.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="current2" className="text-xs font-semibold">Current password</Label>
                      <Input id="current2" type="password" className="rounded-lg border-border/40 h-10" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="new2" className="text-xs font-semibold">New password</Label>
                      <Input id="new2" type="password" className="rounded-lg border-border/40 h-10" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="confirm2" className="text-xs font-semibold">Confirm new password</Label>
                      <Input id="confirm2" type="password" className="rounded-lg border-border/40 h-10" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg px-6 h-9 text-sm shadow-md shadow-emerald-500/15">Save changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </Card>

          {/* 2FA Card */}
          <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 flex flex-col">
            <div className="h-32 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-emerald-500/10 blur-xl" />
              <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-emerald-500/10 transition-all duration-300">
                <Smartphone className="h-7 w-7 text-emerald-400" />
              </div>
            </div>
            <div className="p-5 flex flex-col flex-grow">
              <h3 className="font-bold text-sm mb-1.5">2-Step Verification</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Ensures all sensitive transactions are authorized by you.</p>
              <div className="flex items-center gap-2 text-xs font-semibold bg-muted/30 rounded-lg px-3 py-2.5 border border-border/50 mt-auto">
                <Smartphone className={data.twoFactorEnabled ? "h-3.5 w-3.5 text-emerald-400" : "h-3.5 w-3.5 text-muted-foreground"} />
                {data.twoFactorEnabled ? <span className="text-emerald-400">Active</span> : <span className="text-muted-foreground">Inactive</span>}
                <span className="text-muted-foreground font-normal ml-auto font-mono">{data.phoneMasked}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Login Details Section */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Lock className="h-4 w-4 text-emerald-400" />
          <h2 className="text-base font-bold">Login details</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4 ml-6">
          Information for logging in to FxTrusts. Change your password whenever you think it might have been compromised.
        </p>

        <div className="rounded-2xl border border-border/40 bg-card/50 overflow-hidden">
          {/* Login Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border-b border-border/30 hover:bg-muted/5 transition-colors">
            <div className="flex items-center gap-3 sm:w-1/3">
              <div className="h-8 w-8 rounded-lg bg-muted/20 border border-border/30 flex items-center justify-center">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">Login</span>
            </div>
            <div className="text-sm font-medium sm:w-2/3 flex justify-between items-center mt-2 sm:mt-0">
              <span className="font-mono text-foreground/80">f•••••t@gmail.com</span>
            </div>
          </div>

          {/* Password Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 hover:bg-muted/5 transition-colors">
            <div className="flex items-center gap-3 sm:w-1/3">
              <div className="h-8 w-8 rounded-lg bg-muted/20 border border-border/30 flex items-center justify-center">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">Password</span>
            </div>
            <div className="text-sm font-medium sm:w-2/3 flex justify-between items-center mt-2 sm:mt-0">
              <span className="tracking-[0.25em] text-foreground/60">••••••••••</span>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-lg font-medium px-4 h-8 border-border/40 text-xs hover:bg-muted/20">Change</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] rounded-2xl border-border/50">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold">Change Password</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                      Update your password to keep your account secure.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="current" className="text-xs font-semibold">Current password</Label>
                      <Input id="current" type="password" className="rounded-lg border-border/40 h-10" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="new" className="text-xs font-semibold">New password</Label>
                      <Input id="new" type="password" className="rounded-lg border-border/40 h-10" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="confirm" className="text-xs font-semibold">Confirm new password</Label>
                      <Input id="confirm" type="password" className="rounded-lg border-border/40 h-10" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg px-6 h-9 text-sm shadow-md shadow-emerald-500/15">Save changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Step Verification Section */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="h-4 w-4 text-cyan-400" />
          <h2 className="text-base font-bold">2-Step verification</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4 ml-6">
          2-step verification ensures that all sensitive transactions are authorized by you.
        </p>

        <div className="rounded-2xl border border-border/40 bg-card/50 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 hover:bg-muted/5 transition-colors">
            <div className="flex items-center gap-3 sm:w-1/3">
              <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <Smartphone className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <span className="text-sm text-muted-foreground">Verification method</span>
            </div>
            <div className="text-sm font-medium sm:w-2/3 flex justify-between items-center mt-2 sm:mt-0">
              <span className="font-mono text-foreground/80">+91••••5761</span>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-lg font-medium px-4 h-8 border-border/40 text-xs hover:bg-muted/20">Change</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] rounded-2xl border-border/50">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold">Change Verification Method</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                      Update your phone number for 2-step verification.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="phone" className="text-xs font-semibold">Phone number</Label>
                      <Input id="phone" defaultValue="+91" className="rounded-lg border-border/40 h-10" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg px-6 h-9 text-sm shadow-md shadow-emerald-500/15">Verify and save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      {/* Device & Account Security */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="h-4 w-4 text-red-400" />
          <h2 className="text-base font-bold">Device & account security</h2>
        </div>

        <div className="rounded-2xl border border-red-500/15 bg-red-500/5 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 gap-4">
            <p className="text-sm text-foreground/80">Log out from all other devices except this one to secure your account.</p>
            <Button variant="outline" size="sm" className="rounded-lg font-medium px-4 h-8 border-red-500/20 text-red-400 bg-red-500/5 hover:bg-red-500/10 text-xs gap-1.5 shrink-0">
              <LogOut className="h-3.5 w-3.5" /> Log out from other devices
            </Button>
          </div>
        </div>
      </div>

    </div>
  );
}
