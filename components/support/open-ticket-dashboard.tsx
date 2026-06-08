"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Info, ArrowLeft, ArrowRight, CreditCard, Wifi, BarChart3, MoreHorizontal, Check, ShieldCheck, MonitorSmartphone, UserCheck, Settings2, Server, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const mockTickets = [
  { id: "TK-2024-001", subject: "Account verification issue" },
  { id: "TK-2024-002", subject: "Withdrawal delay" },
  { id: "TK-2024-003", subject: "Platform login error" },
  { id: "TK-2024-004", subject: "Deposit not reflected" },
];

// Subcategories for each topic card
const topicSubcategories: Record<string, { title: string; items: string[] }[]> = {
  "Payments": [
    { title: "Deposit issues", items: ["Deposit not reflected", "Payment method not available", "Deposit limit reached", "Failed deposit", "Other"] },
    { title: "Withdrawal issues", items: ["Withdrawal delayed", "Withdrawal rejected", "Wrong amount received", "Payment method unavailable", "Other"] },
    { title: "Internal transfer", items: ["Transfer failed", "Wrong account credited", "Transfer limits", "Other"] },
  ],
  "Account and Security": [
    { title: "Change personal information", items: ["Change name", "Change registered address"] },
    { title: "Change security type", items: ["Verification code not received", "No access to current security type"] },
    { title: "Account access issue", items: ["Payment method security issue", "Personal area/Trading account security issue"] },
    { title: "SMS & Emails", items: ["SMS verification code not received", "Email verification code not received", "Email not received"] },
    { title: "More", items: ["\"Something went wrong\" issue", "Sign-in issue", "Brand violation", "Other"] },
  ],
  "FxTrusts Platforms": [
    { title: "FxTrusts Web Terminal", items: ["General inquiry", "Charts functionality", "Managing order", "Market analysis", "Blank screen issue", "Unable to see orders", "Prices are not updated", "Terminal response time is low", "Other"] },
    { title: "FxTrusts Trade App", items: ["General inquiry", "Navigation issue", "Charting functionality", "Managing order", "Blank screen issue", "Unable to see orders", "Prices are not updated", "Terminal response time is low", "Other"] },
    { title: "MetaTrader platforms", items: ["General inquiries", "Enable archiving orders", "Enable report", "Enable report", "Restore archived balance", "Trade is disabled", "Account is disabled", "Manual closure of order", "Server issue", "Other"] },
    { title: "Portfolio investment management", items: ["Set up and requirements", "Strategy search and display", "Trader's commission", "Copying/investing", "Registration", "Technical issues", "Request to become a portfolio manager", "Other"] },
  ],
  "Account Verification": [
    { title: "Document verification issue", items: ["Invalid proof of identity document", "Invalid proof of residence document", "Other"] },
  ],
  "Trading": [
    { title: "MT4/MT5 Connection issues", items: ["Frequent disconnections/reconnections", "Unable to connect/login to trading account", "Other"] },
    { title: "Execution Complaint", items: ["Pending order price reached but trade not executed", "Unable to open/modify/close orders", "Incorrect close price", "Didn't place the order"] },
    { title: "Slippage complaint", items: ["Order closed/opened on different price than requested"] },
    { title: "Wrong charges", items: ["Margin charges / calculations", "Trading commission", "Profit / Loss calculations", "Missing NB11 compensations"] },
    { title: "Swap", items: ["Wrong swap calculation / deduction", "Swap Free request", "Admin fee"] },
    { title: "Stop Out", items: ["Deposit/Internal transfer credited with a delay", "Other"] },
    { title: "Pricing Issues", items: ["I disagree with stop out closure", "Wide spread", "Spike/Price mismatches"] },
    { title: "FxTrusts Trade app", items: ["Execution delay", "Trading disabled"] },
    { title: "FxTrusts Terminal", items: ["Execution delay", "Trading disabled"] },
  ],
  "FxTrusts Programs": [
    { title: "Premier", items: ["Membership", "Benefits", "Campaigns", "Callback", "Feedback", "Other"] },
    { title: "Partnership", items: ["General inquiries", "Partner personal area navigation", "Commission calculation issue", "Rebate issue", "Partner campaign inquiry", "Loyalty program inquiry", "Partner feedback", "Share contact details", "Refer a friend program", "Partner Brand Guidelines", "Other"] },
    { title: "FxTrusts Dollars", items: ["I need help with FXD Calculation", "I did not receive FXD", "I did not receive Cashback", "I need help with FXD Spending", "I need general help about FXD"] },
    { title: "Digital Affiliates", items: ["General inquiries", "CPA program inquiries", "Reward inquiries", "Personal area navigation", "Affiliate Brand Guidelines", "Other"] },
  ],
  "VPS": [
    { title: "Technical issue", items: ["Terminal updates", "High ping issue"] },
    { title: "Access to VPS", items: ["Password issue", "Unable to login"] },
    { title: "More", items: ["Software/language installation", "Other"] },
  ],
};

const newTicketTopics = [
  { title: "Payments", icon: CreditCard, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent", glow: "shadow-emerald-500/10", subtopics: "Deposit/Withdrawal issues, Internal transfer problem, Non-supported token/blockchain, Other." },
  { title: "Account and Security", icon: ShieldCheck, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20", gradient: "from-cyan-500/20 via-cyan-500/5 to-transparent", glow: "shadow-cyan-500/10", subtopics: "Change personal information, Change security type, Account access issue, Regulation & Legal, SMS & Emails, More." },
  { title: "FxTrusts Platforms", icon: MonitorSmartphone, color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20", gradient: "from-violet-500/20 via-violet-500/5 to-transparent", glow: "shadow-violet-500/10", subtopics: "FxTrusts Terminal and Trade app, MetaTrader platforms, Portfolio investment management, Social trading." },
  { title: "Account Verification", icon: UserCheck, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", gradient: "from-amber-500/20 via-amber-500/5 to-transparent", glow: "shadow-amber-500/10", subtopics: "Invalid proof of identity document, Invalid proof of residence document, Other." },
  { title: "Trading", icon: Settings2, color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20", gradient: "from-pink-500/20 via-pink-500/5 to-transparent", glow: "shadow-pink-500/10", subtopics: "MT4/5 Connection issues, Execution and slippage complaints, Wrong charges, Swap, Stop Out, Pricing issues." },
  { title: "FxTrusts Programs", icon: BarChart3, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", gradient: "from-blue-500/20 via-blue-500/5 to-transparent", glow: "shadow-blue-500/10", subtopics: "Premier and Partnership membership, Benefits, Digital Affiliates, General inquiries, Reward inquiries, Other." },
  { title: "VPS", icon: Server, color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20", gradient: "from-teal-500/20 via-teal-500/5 to-transparent", glow: "shadow-teal-500/10", subtopics: "Terminal updates, High ping issue, Password issue, Unable to login, Software/language installation, Other." },
];

// Follow-up categories (for "Yes" flow)
const followUpCategories = [
  { title: "Payments", icon: CreditCard, color: "text-emerald-400", borderColor: "border-emerald-500/20", bgColor: "bg-emerald-500/10", gradient: "from-emerald-500/15 to-transparent", items: ["Deposits", "Withdrawals"] },
  { title: "Connection Issues", icon: Wifi, color: "text-cyan-400", borderColor: "border-cyan-500/20", bgColor: "bg-cyan-500/10", gradient: "from-cyan-500/15 to-transparent", items: ["Trading platform lagging", "Unable to connect to trading server / account", "Platform is stuck / not responding"] },
  { title: "Execution", icon: BarChart3, color: "text-violet-400", borderColor: "border-violet-500/20", bgColor: "bg-violet-500/10", gradient: "from-violet-500/15 to-transparent", items: ["Delay", "Requotes / off-quotes", "Spreads", "Stop out", "Slippage", "Pricing", "Swaps"] },
  { title: "Other", icon: MoreHorizontal, color: "text-amber-400", borderColor: "border-amber-500/20", bgColor: "bg-amber-500/10", gradient: "from-amber-500/15 to-transparent", items: ["Deposit delays affecting trading", "Charges / fees", "FxTrusts Trade app", "Other"] },
];

/* ─── Reusable: New Radio Bullet ──────────────────────────── */
function RadioBullet({ selected }: { selected: boolean }) {
  return (
    <div className={`relative h-[22px] w-[22px] rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
      selected 
        ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
        : 'border-[#2a2a2e] bg-[#1a1a1d] hover:border-[#3a3a3e]'
    }`}>
      {selected && (
        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)] animate-in zoom-in-50 duration-200" />
      )}
    </div>
  );
}

/* ─── Reusable: Step Indicator ────────────────────────────── */
function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = ["Contact History", "Select Topic", "Subcategory", "Details"];
  return (
    <div className="flex items-center gap-0 mb-10">
      {steps.map((label, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;
        return (
          <div key={label} className="flex items-center">
            {idx > 0 && (
              <div className={`w-10 md:w-16 h-[2px] ${isCompleted ? 'bg-gradient-to-r from-emerald-500 to-emerald-500/50' : isActive ? 'bg-gradient-to-r from-emerald-500/30 to-border/30' : 'bg-border/20'}`} />
            )}
            <div className="flex items-center gap-2">
              <div className={`flex items-center justify-center h-8 w-8 rounded-full text-[12px] font-bold transition-all duration-300 ${
                isCompleted ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' :
                isActive ? 'bg-transparent text-emerald-400 border-2 border-emerald-500 shadow-lg shadow-emerald-500/15' :
                'bg-transparent text-muted-foreground/40 border-2 border-[#2a2a2e]'
              }`}>
                {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
              </div>
              <span className={`text-[12px] font-semibold hidden sm:inline whitespace-nowrap ${
                isActive ? 'text-foreground' :
                isCompleted ? 'text-emerald-400/80' :
                'text-muted-foreground/30'
              }`}>{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Reusable: Page Header ───────────────────────────────── */
function PageHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: string | (() => void) }) {
  const backContent = (
    <div className="flex items-center justify-center h-10 w-10 rounded-xl border border-border/40 bg-[#141416] hover:bg-[#1c1c1f] hover:border-emerald-500/25 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 cursor-pointer">
      <ArrowLeft className="h-4 w-4 text-muted-foreground" />
    </div>
  );

  return (
    <div className="flex items-center gap-4 mb-3">
      {typeof onBack === 'string' ? <Link href={onBack}>{backContent}</Link> : <button onClick={onBack}>{backContent}</button>}
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        <p className="text-[13px] text-muted-foreground/70 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────── */
export function OpenTicketDashboard() {
  const [ticketStatus, setTicketStatus] = useState("new");
  const [selectedTicket, setSelectedTicket] = useState("");
  const [step, setStep] = useState(1);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("");
  const [showPaymentsPopup, setShowPaymentsPopup] = useState(false);

  /* ─────── Step 1: Contact History ─────── */
  if (step === 1) {
    return (
      <div className="flex flex-col w-full">
        <PageHeader title="Open a ticket" subtitle="Submit a new support request or follow up on an existing one" onBack="/support" />
        <StepIndicator currentStep={1} />

        {/* Info Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-blue-500/8 via-blue-500/4 to-transparent border border-blue-500/12 flex items-center gap-4 px-6 py-4 mb-8 backdrop-blur-sm">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/15 shrink-0">
            <Info className="h-4.5 w-4.5 text-blue-400" />
          </div>
          <p className="text-[13px] text-blue-300/70 leading-relaxed">Submitting more than one ticket for the same issue may delay our response.</p>
        </div>

        {/* Contact Question Card */}
        <div className="rounded-2xl border border-[#1e1e22] bg-gradient-to-br from-[#151517] via-[#131315] to-[#111113] p-7 md:p-9 space-y-7">
          <h2 className="text-[17px] font-bold tracking-tight">Have you contacted us about this matter previously?</h2>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Option: Yes */}
            <label className={`flex items-center gap-4 cursor-pointer rounded-2xl border px-6 py-5 flex-1 transition-all duration-300 ${
              ticketStatus === 'reached-out'
                ? 'border-emerald-500/30 bg-emerald-500/[0.03] shadow-lg shadow-emerald-500/5'
                : 'border-[#1e1e22] hover:border-[#2a2a2e] hover:bg-[#161618]'
            }`}>
              <RadioBullet selected={ticketStatus === 'reached-out'} />
              <input type="radio" name="ticketStatus" value="reached-out" className="hidden" onChange={(e) => setTicketStatus(e.target.value)} checked={ticketStatus === 'reached-out'} />
              <span className="text-[14px] font-medium">Yes, I&apos;ve reached out before</span>
            </label>

            {/* Option: No */}
            <label className={`flex items-center gap-4 cursor-pointer rounded-2xl border px-6 py-5 flex-1 transition-all duration-300 ${
              ticketStatus === 'new'
                ? 'border-emerald-500/30 bg-emerald-500/[0.03] shadow-lg shadow-emerald-500/5'
                : 'border-[#1e1e22] hover:border-[#2a2a2e] hover:bg-[#161618]'
            }`}>
              <RadioBullet selected={ticketStatus === 'new'} />
              <input type="radio" name="ticketStatus" value="new" className="hidden" onChange={(e) => setTicketStatus(e.target.value)} checked={ticketStatus === 'new'} />
              <span className="text-[14px] font-medium">No, it is a new ticket</span>
            </label>
          </div>

          {ticketStatus === 'reached-out' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-widest">Ticket number</label>
              <Select value={selectedTicket} onValueChange={setSelectedTicket}>
                <SelectTrigger className="w-full sm:w-96 h-11 rounded-xl bg-[#141416] border-[#1e1e22] text-sm">
                  <SelectValue placeholder="Select a ticket number" />
                </SelectTrigger>
                <SelectContent>
                  {mockTickets.map((ticket) => (
                    <SelectItem key={ticket.id} value={ticket.id}>
                      <span className="font-medium">{ticket.id}</span><span className="text-muted-foreground ml-2">— {ticket.subject}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-[#1e1e22] pt-6 flex items-center gap-3">
            <Link href="/support"><Button variant="outline" className="rounded-xl font-semibold px-6 h-11 border-[#1e1e22] bg-transparent hover:bg-[#1c1c1f] text-[13px]">Back</Button></Link>
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl px-7 h-11 text-[13px] shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 gap-2 active:scale-[0.97] transition-all duration-300" onClick={() => { setSelectedTopic(""); setStep(2); }}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TicketFooter />
      </div>
    );
  }

  /* ─────── Step 2: New Ticket — Topic Cards ─────── */
  if (step === 2 && ticketStatus === 'new') {
    return (
      <div className="flex flex-col w-full">
        <PageHeader title="Open a ticket" subtitle="Please select a topic for your inquiry so we can assist you better" onBack={() => setStep(1)} />
        <StepIndicator currentStep={2} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {newTicketTopics.map((topic) => (
            <div
              key={topic.title}
              className={`group rounded-2xl border bg-gradient-to-br ${topic.gradient} cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${topic.glow} overflow-hidden ${selectedTopic === topic.title ? `${topic.border} shadow-xl ${topic.glow}` : 'border-[#1e1e22] hover:border-[#2a2a2e]'}`}
              onClick={() => {
                if (topic.title === 'Payments') {
                  setShowPaymentsPopup(true);
                } else {
                  setSelectedTopic(topic.title); setSelectedSubcategory(""); setStep(3);
                }
              }}
            >
              <div className="p-6">
                <div className={`flex items-center justify-center h-12 w-12 rounded-2xl border ${topic.bg} ${topic.border} mb-5 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                  <topic.icon className={`h-5.5 w-5.5 ${topic.color}`} />
                </div>
                <h3 className="text-[15px] font-bold mb-2 tracking-tight">{topic.title}</h3>
                <p className="text-[12px] text-muted-foreground/60 leading-relaxed">{topic.subtopics}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-12">
          <Button variant="outline" className="rounded-xl font-semibold px-6 h-11 border-[#1e1e22] bg-transparent hover:bg-[#1c1c1f] text-[13px] gap-2" onClick={() => setStep(1)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        </div>

        {/* Payments Popup */}
        <Dialog open={showPaymentsPopup} onOpenChange={setShowPaymentsPopup}>
          <DialogContent className="sm:max-w-md rounded-2xl border-[#1e1e22] bg-[#131315]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Go to Transaction History</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground leading-relaxed">
              For assistance on your transactions press continue button, open the transaction and select &quot;support request&quot;.
            </p>
            <div className="flex justify-end pt-2">
              <Link href="/wallet/history">
                <Button className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl px-7 h-10 text-sm shadow-lg shadow-emerald-500/20">
                  Continue
                </Button>
              </Link>
            </div>
          </DialogContent>
        </Dialog>

        <TicketFooter />
      </div>
    );
  }

  /* ─────── Step 2: Follow-up — Radio Category Cards ─────── */
  if (step === 2 && ticketStatus === 'reached-out') {
    return (
      <div className="flex flex-col w-full">
        <PageHeader title="Please select your topic" subtitle="Choose the category that best describes your issue" onBack={() => setStep(1)} />
        <StepIndicator currentStep={2} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {followUpCategories.map((category) => (
            <div key={category.title} className={`rounded-2xl border overflow-hidden transition-all duration-300 ${
              category.items.includes(selectedTopic)
                ? `${category.borderColor} shadow-xl bg-[#141416]`
                : 'border-[#1e1e22] hover:border-[#2a2a2e]'
            }`}>
              {/* Category Header with gradient */}
              <div className={`flex items-center gap-3.5 px-6 py-4 border-b border-[#1e1e22] bg-gradient-to-r ${category.gradient}`}>
                <div className={`flex items-center justify-center h-10 w-10 rounded-xl border ${category.bgColor} ${category.borderColor}`}>
                  <category.icon className={`h-5 w-5 ${category.color}`} />
                </div>
                <h3 className="text-[15px] font-bold tracking-tight">{category.title}</h3>
              </div>

              {/* Radio Items */}
              <div className="p-2.5">
                {category.items.map((item) => (
                  <label key={item} className={`flex items-center gap-3.5 cursor-pointer px-4 py-3.5 rounded-xl transition-all duration-200 group ${
                    selectedTopic === item
                      ? 'bg-emerald-500/[0.06]'
                      : 'hover:bg-[#161618]'
                  }`}>
                    <RadioBullet selected={selectedTopic === item} />
                    <input type="radio" name="topic" value={item} className="hidden" onChange={(e) => setSelectedTopic(e.target.value)} checked={selectedTopic === item} />
                    <span className={`text-[13px] transition-colors ${
                      selectedTopic === item ? 'text-foreground font-semibold' : 'text-muted-foreground/70 group-hover:text-foreground/80'
                    }`}>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-12">
          <Button variant="outline" className="rounded-xl font-semibold px-6 h-11 border-[#1e1e22] bg-transparent hover:bg-[#1c1c1f] text-[13px] gap-2" onClick={() => setStep(1)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <Button className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl px-7 h-11 text-[13px] shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 gap-2 active:scale-[0.97] transition-all duration-300" disabled={!selectedTopic}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <TicketFooter />
      </div>
    );
  }

  /* ─────── Step 3: Subcategory Selection ─────── */
  const subcategories = topicSubcategories[selectedTopic] || [];
  const currentTopicMeta = newTicketTopics.find(t => t.title === selectedTopic);

  return (
    <div className="flex flex-col w-full">
      <PageHeader title="Please select the ticket category" subtitle={`Choose the specific subcategory for your ${selectedTopic} issue`} onBack={() => { setStep(2); setSelectedSubcategory(""); }} />
      <StepIndicator currentStep={3} />

      <div className="flex flex-col lg:flex-row gap-6 mb-8">
        {/* Main Content: Subcategory Groups */}
        <div className="flex-1 space-y-5">
          {subcategories.map((group) => (
            <div key={group.title} className="rounded-2xl border border-[#1e1e22] overflow-hidden hover:border-[#2a2a2e] transition-all duration-300">
              {/* Group Header */}
              <div className={`flex items-center gap-3 px-6 py-4 border-b border-[#1e1e22] bg-gradient-to-r ${currentTopicMeta?.gradient || 'from-emerald-500/10 to-transparent'}`}>
                <div className={`flex items-center justify-center h-8 w-8 rounded-lg border ${currentTopicMeta?.bg || 'bg-emerald-500/10'} ${currentTopicMeta?.border || 'border-emerald-500/20'}`}>
                  {currentTopicMeta && <currentTopicMeta.icon className={`h-4 w-4 ${currentTopicMeta.color}`} />}
                </div>
                <h3 className="text-[14px] font-bold tracking-tight">{group.title}</h3>
              </div>

              {/* Radio Items */}
              <div className="p-2.5">
                {group.items.map((item) => (
                  <label key={item} className={`flex items-center gap-3.5 cursor-pointer px-4 py-3.5 rounded-xl transition-all duration-200 group ${
                    selectedSubcategory === item
                      ? 'bg-emerald-500/[0.06]'
                      : 'hover:bg-[#161618]'
                  }`}>
                    <RadioBullet selected={selectedSubcategory === item} />
                    <input type="radio" name="subcategory" value={item} className="hidden" onChange={(e) => setSelectedSubcategory(e.target.value)} checked={selectedSubcategory === item} />
                    <span className={`text-[13px] transition-colors ${
                      selectedSubcategory === item ? 'text-foreground font-semibold' : 'text-muted-foreground/70 group-hover:text-foreground/80'
                    }`}>{item}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar: Progress Tracker */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="rounded-2xl border border-[#1e1e22] overflow-hidden lg:sticky lg:top-6">
            <div className="bg-gradient-to-r from-emerald-500/12 via-emerald-500/5 to-transparent border-b border-emerald-500/10 px-6 py-4">
              <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">Your Progress</p>
            </div>
            <div className="p-5 space-y-1">
              {[
                { num: 1, label: "Category", value: selectedTopic, done: true },
                { num: 2, label: "Subcategory", value: selectedSubcategory || null, done: !!selectedSubcategory },
                { num: 3, label: "Specific issue", value: null, done: false },
                { num: 4, label: "Summary", value: null, done: false },
              ].map((s, idx, arr) => (
                <div key={s.label} className="flex items-start gap-3.5">
                  <div className="flex flex-col items-center">
                    <div className={`flex items-center justify-center h-8 w-8 rounded-full text-[11px] font-bold transition-all duration-300 ${
                      s.done ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' :
                      idx === arr.findIndex(x => !x.done) ? 'bg-transparent text-emerald-400 border-2 border-emerald-500' :
                      'bg-transparent text-muted-foreground/30 border-2 border-[#1e1e22]'
                    }`}>
                      {s.done ? <Check className="h-3.5 w-3.5" /> : s.num}
                    </div>
                    {idx < arr.length - 1 && (
                      <div className={`w-[2px] h-6 mt-1 rounded-full ${s.done ? 'bg-emerald-500/30' : 'bg-[#1e1e22]'}`} />
                    )}
                  </div>
                  <div className="pt-1.5">
                    <p className={`text-[12px] font-semibold ${s.done ? 'text-foreground' : idx === arr.findIndex(x => !x.done) ? 'text-foreground' : 'text-muted-foreground/30'}`}>{s.label}</p>
                    {s.value && <p className="text-[11px] text-emerald-400/70 mt-0.5 font-medium">{s.value}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mb-12">
        <Button variant="outline" className="rounded-xl font-semibold px-6 h-11 border-[#1e1e22] bg-transparent hover:bg-[#1c1c1f] text-[13px] gap-2" onClick={() => { setStep(2); setSelectedSubcategory(""); }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <Button className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl px-7 h-11 text-[13px] shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 gap-2 active:scale-[0.97] transition-all duration-300" disabled={!selectedSubcategory}>
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <TicketFooter />
    </div>
  );
}

/* ─── Footer ──────────────────────────────────────────────── */
function TicketFooter() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-8 text-[12px] text-muted-foreground/50 mt-14 pt-8 border-t border-[#1a1a1d]">
      <div className="md:col-span-4 flex flex-col gap-4 leading-relaxed">
        <p>Vanvest Limited is registered and regulated by the Financial Services Commission of the Republic of Vanuatu under registration number 700276 and has its registered office at Law Partners House, Kumul Highway, Port Vila, Vanuatu.</p>
        <p>This website is operated by Vanvest Limited.</p>
        <p>The entity above is duly authorized to operate under the FxTrusts brand and trademarks.</p>
        <p>Risk Warning: Online Forex/CFDs are complex instruments and come with a high risk of losing money rapidly due to leverage. You should consider whether you understand how CFDs work and whether you can afford to take the high risk of losing your money. Under no circumstances shall FxTrusts have any liability to any person or entity for any loss or damage in whole or part caused by, resulting from, or relating to any financial activity. <a href="#" className="text-emerald-400/60 hover:text-emerald-400 hover:underline transition-colors">Learn more</a></p>
        <p>The information on this website may only be copied with the express written permission of FxTrusts.</p>
        <p>FxTrusts complies with the Payment Card Industry Data Security Standard (PCI DSS) to ensure your security and privacy. We conduct regular vulnerability scans and penetration tests in accordance with the PCI DSS requirements for our business model.</p>
        <p className="mt-4 text-[10px] opacity-30">3.0.21</p>
      </div>
      <div className="md:col-span-2 flex flex-col gap-2.5">
        {["Client Agreement", "General Business Terms", "Partnership Agreement", "Bonus terms and Conditions", "Complaints Procedure for Clients", "Risk disclosure", "Preventing money laundering", "Security instructions", "Privacy Agreement", "Key Facts Statement", "Contact"].map((link) => (
          <a key={link} href="#" className="text-emerald-400/50 hover:text-emerald-400 hover:underline transition-colors inline-block">{link}</a>
        ))}
        <p className="mt-8 pt-4 text-muted-foreground/30">© 2008 - 2026. FxTrusts</p>
      </div>
    </div>
  );
}
