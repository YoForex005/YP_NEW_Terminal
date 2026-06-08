"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, MessageSquare, Phone, X, Send, Headphones, LifeBuoy, Sparkles, BookOpen, FileText, Shield, Clock, ChevronDown, ExternalLink, Zap, HelpCircle, Mail } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import Link from "next/link";

const quickLinks = [
  { title: "Getting Started", desc: "Learn the basics of trading", icon: BookOpen, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { title: "Account FAQ", desc: "Verification, settings & more", icon: HelpCircle, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { title: "Deposits & Withdrawals", desc: "Payment methods and processing", icon: FileText, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { title: "Security", desc: "Keep your account secure", icon: Shield, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  { title: "Platform Guides", desc: "MT4, MT5 and more", icon: Zap, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  { title: "Email Support", desc: "support@fxtrusts.com", icon: Mail, color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20" },
];

const faqs = [
  { q: "How do I verify my account?", a: "Go to Settings → Profile → Verification. Upload a valid government-issued ID and proof of address. Verification typically takes 1-2 business days." },
  { q: "How long do withdrawals take?", a: "Most withdrawals are processed within 24 hours. Bank transfers may take 3-5 business days. E-wallet withdrawals are usually instant." },
  { q: "Why was my deposit not reflected?", a: "Deposits may take up to 30 minutes to reflect. If it's been longer, please check your payment provider's status and open a support ticket with your transaction ID." },
  { q: "How do I reset my trading password?", a: "Go to Settings → Security → Trading Password. Click 'Reset Password' and follow the instructions sent to your registered email." },
];

export function SupportHubDashboard() {
  const { user } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [tickets, setTickets] = useState<{id: string, subject: string, status: string, createdAt: string}[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  useEffect(() => {
    fetch("/api/private/support/tickets")
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.data?.tickets) {
          setTickets(data.data.tickets);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingTickets(false));
  }, []);

  return (
    <div className="flex flex-col gap-12 w-full pb-8">
      
      {/* Hero: Help Center */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-600/20 via-emerald-500/10 to-transparent border border-emerald-500/15 p-8 md:p-10">
        {/* Background Effects */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-teal-500/5 rounded-full blur-2xl translate-y-1/2" />
        
        <div className="relative">
          {/* Top Row: Header + Stats */}
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8 mb-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
                <Sparkles className="h-3 w-3" />
                SUPPORT HUB
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Hello, <span className="text-emerald-400">{user?.name?.toUpperCase() || "TRADER"}</span>
              </h1>
              <p className="text-base text-muted-foreground max-w-md">
                How can we help you today? Search our knowledge base or get in touch with our team.
              </p>
            </div>

            {/* Mini Stats */}
            <div className="flex gap-3 shrink-0">
              <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[100px]">
                <p className="text-xl font-bold text-emerald-400">24/7</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Support</p>
              </div>
              <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[100px]">
                <p className="text-xl font-bold">&lt;2h</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Avg Response</p>
              </div>
              <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[100px]">
                <p className="text-xl font-bold">98%</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Resolved</p>
              </div>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
            <Input 
              placeholder="Search for help articles, FAQs, or describe your issue..." 
              className="w-full pl-12 pr-14 h-14 bg-background/70 backdrop-blur-sm border-border/50 rounded-xl text-sm focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/30"
            />
            <Button 
              size="icon" 
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-9 w-9 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-lg shadow-emerald-500/25"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Links Grid */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Quick links</h2>
          <button className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1">
            View all articles <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickLinks.map((link) => (
            <div key={link.title} className="group flex flex-col items-center text-center gap-3 p-4 rounded-xl border border-border/40 bg-card/50 hover:bg-card hover:border-border hover:shadow-md transition-all duration-200 cursor-pointer">
              <div className={`flex items-center justify-center h-11 w-11 rounded-xl border ${link.bg} group-hover:scale-110 transition-transform duration-200`}>
                <link.icon className={`h-5 w-5 ${link.color}`} />
              </div>
              <div>
                <p className="text-xs font-semibold leading-tight">{link.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{link.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact Cards */}
      <div className="space-y-5">
        <h2 className="text-lg font-bold tracking-tight">Contact us</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          {/* Open Ticket */}
          <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-violet-500/30 hover:shadow-xl hover:shadow-violet-500/5 transition-all duration-300 flex flex-col">
            <div className="h-36 bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-violet-500/10 blur-xl" />
              <div className="relative flex items-center justify-center h-16 w-16 rounded-2xl bg-violet-500/15 border border-violet-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-violet-500/10 transition-all duration-300">
                <LifeBuoy className="h-8 w-8 text-violet-400" />
              </div>
            </div>
            <div className="p-5 flex flex-col flex-grow">
              <h3 className="font-bold text-sm mb-1.5">Need assistance?</h3>
              <p className="text-xs text-muted-foreground mb-5 flex-grow leading-relaxed">
                Complete the form and we will get back to you shortly.
              </p>
              <Link href="/support/open-ticket" className="inline-flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg gap-1.5 shadow-md shadow-emerald-500/20 h-9 px-3 text-xs">
                <span className="text-base leading-none">+</span> Open a ticket
              </Link>
            </div>
          </Card>

          {/* Live Chat */}
          <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/5 transition-all duration-300 flex flex-col">
            <div className="h-36 bg-gradient-to-br from-cyan-500/15 via-cyan-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-cyan-500/10 blur-xl" />
              <div className="relative flex items-center justify-center h-16 w-16 rounded-2xl bg-cyan-500/15 border border-cyan-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-cyan-500/10 transition-all duration-300">
                <MessageSquare className="h-8 w-8 text-cyan-400" />
              </div>
            </div>
            <div className="p-5 flex flex-col flex-grow">
              <h3 className="font-bold text-sm mb-1.5">Live chat</h3>
              <p className="text-xs text-muted-foreground mb-5 flex-grow leading-relaxed">
                Can&apos;t find the answers? Chat with our Intelligent Assistant 24/7.
              </p>
              <Button 
                size="sm"
                className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 font-semibold rounded-lg shadow-md shadow-emerald-500/20 h-9 text-xs w-fit"
                onClick={() => setIsChatOpen(true)}
              >
                <MessageSquare className="h-3.5 w-3.5" /> Start chat
              </Button>
            </div>
          </Card>

          {/* Phone Support */}
          <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-amber-500/30 hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 flex flex-col">
            <div className="h-36 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-amber-500/10 blur-xl" />
              <div className="relative flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500/15 border border-amber-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-amber-500/10 transition-all duration-300">
                <Headphones className="h-8 w-8 text-amber-400" />
              </div>
            </div>
            <div className="p-5 flex flex-col flex-grow">
              <h3 className="font-bold text-sm mb-1.5">Call us</h3>
              <p className="text-xs text-muted-foreground mb-4 flex-grow leading-relaxed">
                Speak with our team directly for urgent matters.
              </p>
              <div className="flex items-center gap-2 text-xs font-semibold bg-muted/30 rounded-lg px-3 py-2.5 border border-border/50">
                <Phone className="h-3.5 w-3.5 text-emerald-400" />
                <span>000-800-100-4378</span>
                <span className="text-[10px] text-muted-foreground font-normal">(toll free)</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="space-y-5">
        <h2 className="text-lg font-bold tracking-tight">Frequently asked questions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {faqs.map((faq, idx) => (
            <div key={idx} className="rounded-xl border border-border/40 bg-card/50 overflow-hidden hover:border-border transition-colors">
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="flex items-center justify-between w-full px-5 py-4 text-left"
              >
                <span className="text-sm font-semibold pr-3">{faq.q}</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${openFaq === idx ? "rotate-180" : ""}`} />
              </button>
              {openFaq === idx && (
                <div className="px-5 pb-4 pt-0 animate-in fade-in duration-200">
                  <p className="text-xs text-muted-foreground leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* My Tickets Section */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">My tickets</h2>
          <Link href="/support/open-ticket" className="inline-flex items-center justify-center h-8 px-3 text-xs rounded-lg border border-border/50 hover:bg-card/50 gap-1.5 font-semibold">
            <span className="text-sm leading-none">+</span> New ticket
          </Link>
        </div>
        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-emerald-500/[0.03] via-[#000000]/40 to-[#000000]/80 shadow-2xl overflow-hidden backdrop-blur-md">
          <div className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/[0.05] gap-3">
            <Select defaultValue="all">
              <SelectTrigger className="w-full md:w-[200px] bg-white/[0.02] hover:bg-white/[0.05] transition-colors h-9 text-xs rounded-lg border-white/10">
                <div className="flex gap-1 items-center">
                  <span className="text-muted-foreground/60">Status:</span>
                  <SelectValue placeholder="All" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="under-review">Under Review</SelectItem>
                <SelectItem value="action-required">Action Required</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="reopened">Reopened</SelectItem>
                <SelectItem value="solution-provided">Solution Provided</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
              <Input placeholder="Search tickets..." className="pl-8 h-9 text-xs w-full rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors border-white/10 placeholder:text-muted-foreground/40 text-foreground" />
            </div>
          </div>
          
          {/* Table */}
          <div className="hidden md:grid grid-cols-4 gap-4 px-6 py-4 text-[12px] font-bold text-emerald-400 uppercase tracking-widest bg-gradient-to-br from-emerald-600/20 via-emerald-500/10 to-transparent border-b border-emerald-500/20">
            <span>Subject</span>
            <span>Ticket ID</span>
            <span>Status</span>
            <span className="text-right">Date created ↑</span>
          </div>

          {loadingTickets ? (
            <div className="py-16 flex justify-center text-sm text-muted-foreground">Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4 shadow-inner shadow-emerald-500/20">
                <Clock className="h-5 w-5 text-emerald-500/80" />
              </div>
              <h3 className="text-sm font-bold mb-1 text-white">No tickets yet</h3>
              <p className="text-[13px] text-muted-foreground/80 max-w-[200px] leading-relaxed">Your support tickets will appear here when you create one.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {tickets.map(t => (
                <div key={t.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 px-6 py-4 text-sm border-b border-border/20 hover:bg-white/[0.02] transition-colors items-center">
                  <span className="font-medium text-foreground truncate">{t.subject}</span>
                  <span className="text-muted-foreground">{t.id}</span>
                  <span>
                    <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">{t.status}</span>
                  </span>
                  <span className="text-right text-muted-foreground text-xs">{new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live Chat Window */}
      {isChatOpen && (
        <div className="fixed bottom-6 right-6 w-80 sm:w-96 bg-background border border-border/50 rounded-2xl shadow-2xl shadow-black/40 z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-4 flex justify-between items-center text-white">
            <div className="font-bold flex items-center gap-2.5 text-sm">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/20">
                <MessageSquare className="h-4 w-4" />
              </div>
              FxTrusts Support
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 hover:bg-white/20 text-white rounded-full"
              onClick={() => setIsChatOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="p-4 h-72 overflow-y-auto bg-muted/5 flex flex-col gap-4">
            <div className="flex gap-3 max-w-[85%]">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white shrink-0">
                <MessageSquare className="h-3.5 w-3.5" />
              </div>
              <div className="bg-muted/30 border border-border/50 p-3 rounded-2xl rounded-tl-none text-xs leading-relaxed">
                Welcome to FxTrusts 👋 How can I support you today?
              </div>
            </div>
          </div>
          
          <div className="p-3 border-t border-border/50 bg-background">
            <div className="relative">
              <Input 
                placeholder="Type your message..." 
                className="pr-10 h-9 text-xs bg-muted/20 border-border/50 rounded-xl focus-visible:ring-emerald-500/30"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && chatMessage.trim()) {
                    setChatMessage("");
                  }
                }}
              />
              <Button 
                size="icon" 
                variant="ghost" 
                className="absolute right-1 top-0.5 h-7 w-7 text-emerald-500 hover:text-emerald-400 hover:bg-transparent"
                onClick={() => {
                  if (chatMessage.trim()) {
                    setChatMessage("");
                  }
                }}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
