"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Lock, RefreshCw, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToastStore } from "@/store/toast-store";
import { useTradingStore } from "@/store/trading-store";
import type { DashboardSnapshot, TradingAccount, TradingAccountCredentials } from "@/types/dashboard";
import { cn } from "@/lib/utils";

interface AccountCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: TradingAccount | null;
  onChangePassword?: (account: TradingAccount) => void;
}

type PasswordType = "trading" | "investor";

interface VerifyCredentialsApiResponse {
  ok?: boolean;
  message?: string;
  error?: string;
  stage?: string;
  code?: string;
  server?: string;
  snapshot?: DashboardSnapshot;
}

const credentialValue = (...values: Array<string | undefined | null>): string => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return value ?? "";
    }
  }

  return "";
};

const hasCredentialValue = (value: string | undefined | null) => Boolean(value?.trim());

const PASSWORD_NOT_STORED_LABEL = "Password not stored";

const copyablePasswordValue = (value: string | undefined | null): string =>
  hasCredentialValue(value) ? value ?? "" : PASSWORD_NOT_STORED_LABEL;

const resolveCredentials = (
  account: TradingAccount | null,
  fetchedCredentials: Partial<TradingAccountCredentials> | null,
): TradingAccountCredentials | null => {
  if (!account) {
    return null;
  }

  const snapshotCredentials = account.credentials;
  if (!fetchedCredentials && !snapshotCredentials) {
    return {
      login: account.accountNumber,
      server: account.serverIp ?? "",
      tradingPassword: "",
      investorPassword: "",
      generatedAt: "",
    };
  }

  return {
    login: credentialValue(fetchedCredentials?.login, snapshotCredentials?.login, account.accountNumber),
    server: credentialValue(fetchedCredentials?.server, snapshotCredentials?.server, account.serverIp),
    tradingPassword: credentialValue(
      fetchedCredentials?.tradingPassword,
      snapshotCredentials?.tradingPassword,
    ),
    investorPassword: credentialValue(
      fetchedCredentials?.investorPassword,
      snapshotCredentials?.investorPassword,
    ),
    generatedAt: credentialValue(fetchedCredentials?.generatedAt, snapshotCredentials?.generatedAt),
    source: fetchedCredentials?.source ?? snapshotCredentials?.source,
  };
};

const PasswordField = ({
  label,
  value,
  reveal,
  onToggleReveal,
  onCopy,
  helperText,
  onSetPassword,
}: {
  label: string;
  value: string | undefined | null;
  reveal: boolean;
  onToggleReveal: () => void;
  onCopy: () => void;
  helperText?: string;
  onSetPassword?: () => void;
}) => {
  const hasValue = hasCredentialValue(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        {helperText ? (
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
            {helperText}
          </span>
        ) : null}
      </div>
      {!hasValue && onSetPassword ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800/60 dark:bg-amber-900/20">
          <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="flex-1 text-xs text-amber-800 dark:text-amber-300 italic">
            {PASSWORD_NOT_STORED_LABEL} — set one to use WebTrader
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 rounded-lg border-amber-400 px-2 text-[10px] font-bold text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
            onClick={onSetPassword}
          >
            Set Password
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950">
          <code className="flex-1 truncate px-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {!hasValue
              ? <span className="text-slate-400 dark:text-slate-600 italic">{PASSWORD_NOT_STORED_LABEL}</span>
              : reveal ? value : "*".repeat(Math.max(10, value?.length ?? 0))}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-500 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
            disabled={!hasValue}
            title={hasValue ? `Reveal ${label.toLowerCase()}` : "Password is not stored. Reset it to create a new stored value."}
            onClick={onToggleReveal}
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            title={hasValue ? `Copy ${label.toLowerCase()}` : "Password is not stored. Reset it to create a new stored value."}
            onClick={onCopy}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

const LoginField = ({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) => (
  <div className="space-y-2">
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {label}
    </p>
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950">
      <code className="flex-1 truncate px-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        onClick={onCopy}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

export function AccountCredentialsModal({
  isOpen,
  onClose,
  account,
  onChangePassword,
}: AccountCredentialsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [showTrading, setShowTrading] = useState(false);
  const [showInvestor, setShowInvestor] = useState(false);
  const [verifyingType, setVerifyingType] = useState<PasswordType | null>(null);
  const [lastVerified, setLastVerified] = useState<{
    type: PasswordType;
    server?: string;
    timestamp: string;
  } | null>(null);
  const [fetchedCredentials, setFetchedCredentials] = useState<Partial<TradingAccountCredentials> | null>(null);
  const [fetchingCredentials, setFetchingCredentials] = useState(false);
  const { addToast } = useToastStore();
  const { hydrateFromSnapshot } = useTradingStore();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setShowTrading(false);
      setShowInvestor(false);
      setVerifyingType(null);
      setLastVerified(null);
      setFetchedCredentials(null);
    }
  }, [isOpen, account?.id]);

  // Fetch real credentials from C++ DB whenever the modal opens
  useEffect(() => {
    if (!isOpen || !account?.id) return;

    let cancelled = false;
    setFetchingCredentials(true);

    fetch(`/api/private/accounts/${encodeURIComponent(account.id)}/stored-credentials`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return;
        const payload = (await res.json()) as { ok?: boolean; credentials?: Partial<TradingAccountCredentials> };
        if (!cancelled && payload.ok && payload.credentials) {
          setFetchedCredentials(payload.credentials);
        }
      })
      .catch(() => { /* silently fall back to account.credentials */ })
      .finally(() => {
        if (!cancelled) setFetchingCredentials(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, account?.id]);

  // Merge freshly fetched credentials with the snapshot so partial backend payloads
  // cannot hide passwords that are already available on the account.
  const credentials = useMemo(
    () => resolveCredentials(account, fetchedCredentials),
    [account, fetchedCredentials],
  );
  const generatedAtLabel = useMemo(() => {
    if (!credentials?.generatedAt) return null;
    const parsed = new Date(credentials.generatedAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString("en-US");
  }, [credentials?.generatedAt]);

  const copyValue = async (value: string, label: string) => {
    if (!hasCredentialValue(value)) {
      addToast(`${label} is not available. Reset this password to create a new stored value.`, "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      addToast(`${label} copied.`, "success");
    } catch {
      addToast(`Failed to copy ${label.toLowerCase()}.`, "error");
    }
  };

  const verifyLogin = async (passwordType: PasswordType) => {
    if (!account) {
      return;
    }

    if (account.platform !== "mt5") {
      addToast("Credential verification is only available for MT5 accounts.", "error");
      return;
    }

    const password =
      passwordType === "trading"
        ? credentials?.tradingPassword
        : credentials?.investorPassword;

    if (!hasCredentialValue(password)) {
      addToast("No password is stored for verification. Reset this password first.", "error");
      return;
    }

    setVerifyingType(passwordType);

    const response = await fetch(`/api/private/accounts/${account.id}/credentials/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        passwordType,
        password,
      }),
    });

    let payload: VerifyCredentialsApiResponse = {};
    try {
      payload = (await response.json()) as VerifyCredentialsApiResponse;
    } catch {
      payload = {};
    }

    if (payload.snapshot) {
      hydrateFromSnapshot(payload.snapshot);
    }

    if (!response.ok) {
      const marker =
        payload.stage || payload.code
          ? ` [${payload.stage ?? "unknown"}${payload.code ? `/${payload.code}` : ""}]`
          : "";
      addToast(
        `${payload.error ?? payload.message ?? "MT5 credentials verification failed."}${marker}`,
        "error",
      );
      setVerifyingType(null);
      return;
    }

    setLastVerified({
      type: passwordType,
      server: payload.server,
      timestamp: new Date().toISOString(),
    });
    addToast(
      payload.message ??
      `${passwordType === "trading" ? "Trading" : "Investor"} login verified successfully.`,
      "success",
    );
    setVerifyingType(null);
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && account ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, x: "-50%", y: "-40%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.96, x: "-50%", y: "-40%" }}
            className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Account Credentials
                    </h3>
                    {fetchingCredentials ? (
                      <RefreshCw className="h-3 w-3 animate-spin text-slate-400" />
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {account.platform === "mt5" ? "MT5" : "cTrader"} login {account.accountNumber}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Login
                  </p>
                  <code className="mt-1 block text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {account.accountNumber}
                  </code>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Server
                  </p>
                  <code className="mt-1 block text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {credentials?.server ?? account.serverIp ?? "Not assigned"}
                  </code>
                </div>
              </div>

              {credentials ? (
                <div className="space-y-4">
                  <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Trading Login (Trade Account / WebTrader)
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 rounded-lg px-2 text-[10px] font-bold"
                        disabled={
                          verifyingType !== null ||
                          account.platform !== "mt5" ||
                          !hasCredentialValue(credentials.tradingPassword)
                        }
                        title={
                          hasCredentialValue(credentials.tradingPassword)
                            ? "Verify this trading password with MT5"
                            : "Trading password is not stored. Reset it to verify MT5 login."
                        }
                        onClick={() => {
                          void verifyLogin("trading");
                        }}
                      >
                        {verifyingType === "trading" ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : null}
                        Test MT5 Login
                      </Button>
                    </div>
                    <LoginField
                      label="Login"
                      value={credentials.login || account.accountNumber}
                      onCopy={() =>
                        void copyValue(credentials.login || account.accountNumber, "Trading login")
                      }
                    />
                    <PasswordField
                      label="Password"
                      value={credentials.tradingPassword}
                      reveal={showTrading}
                      onToggleReveal={() => setShowTrading((prev) => !prev)}
                      onCopy={() =>
                        void copyValue(credentials.tradingPassword ?? "", "Trading password")
                      }
                      onSetPassword={onChangePassword && account ? () => { onClose(); onChangePassword(account); } : undefined}
                    />
                    {lastVerified?.type === "trading" ? (
                      <p className="text-[11px] font-medium text-primary dark:text-primary">
                        Verified{" "}
                        {new Date(lastVerified.timestamp).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {lastVerified.server ? ` on ${lastVerified.server}` : ""}.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Investor Login (Read-Only)
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-7 rounded-lg px-2 text-[10px] font-bold"
                        disabled={
                          verifyingType !== null ||
                          account.platform !== "mt5" ||
                          !hasCredentialValue(credentials.investorPassword)
                        }
                        title={
                          hasCredentialValue(credentials.investorPassword)
                            ? "Verify this investor password with MT5"
                            : "Investor password is not stored. Reset it to verify MT5 login."
                        }
                        onClick={() => {
                          void verifyLogin("investor");
                        }}
                      >
                        {verifyingType === "investor" ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : null}
                        Test MT5 Login
                      </Button>
                    </div>
                    <LoginField
                      label="Login"
                      value={credentials.login || account.accountNumber}
                      onCopy={() =>
                        void copyValue(credentials.login || account.accountNumber, "Investor login")
                      }
                    />
                    <PasswordField
                      label="Password"
                      value={credentials.investorPassword}
                      reveal={showInvestor}
                      onToggleReveal={() => setShowInvestor((prev) => !prev)}
                      onCopy={() =>
                        void copyValue(credentials.investorPassword ?? "", "Investor password")
                      }
                      onSetPassword={onChangePassword && account ? () => { onClose(); onChangePassword(account); } : undefined}
                    />
                    {lastVerified?.type === "investor" ? (
                      <p className="text-[11px] font-medium text-primary dark:text-primary">
                        Verified{" "}
                        {new Date(lastVerified.timestamp).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {lastVerified.server ? ` on ${lastVerified.server}` : ""}.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                  <p className="text-sm text-amber-900 dark:text-amber-300">
                    Credentials are not available for this account. This usually means it was created
                    before credentials storage was enabled.
                  </p>
                  {onChangePassword && account && (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3 gap-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700"
                      onClick={() => { onClose(); onChangePassword(account); }}
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Set Password Now
                    </Button>
                  )}
                </div>
              )}

              <div
                className={cn(
                  "flex items-start gap-2 rounded-xl border p-3 text-xs",
                  "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300",
                )}
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="space-y-1">
                  <p className="font-semibold">Store credentials securely.</p>
                  {generatedAtLabel ? (
                    <p>
                      Generated on <strong>{generatedAtLabel}</strong>.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
              <div>
                {onChangePassword && account && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-muted-foreground hover:text-foreground"
                    onClick={() => { onClose(); onChangePassword(account); }}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Change Password
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
              {credentials ? (
                <Button
                  type="button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() =>
                    void copyValue(
                      [
                        `Trading Login: ${credentials.login || account.accountNumber}`,
                        `Trading Password: ${copyablePasswordValue(credentials.tradingPassword)}`,
                        `Investor Login: ${credentials.login || account.accountNumber}`,
                        `Investor Password: ${copyablePasswordValue(credentials.investorPassword)}`,
                        `Server: ${credentials.server ?? account.serverIp ?? "Not assigned"}`,
                      ].join("\n"),
                      "Credentials",
                    )
                  }
                >
                  <Check className="mr-2 h-4 w-4" />
                  Copy All
                </Button>
              ) : null}
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
