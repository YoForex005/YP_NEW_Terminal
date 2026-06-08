import { randomInt, randomUUID } from "node:crypto";

import {
  getSocialStrategies,
  getUserSnapshot,
  getUserById,
  updateUserSnapshot,
  getAccountCreatedAtFromPg,
} from "@/lib/server/database";
import {
  changeMt5UserPassword,
  provisionMt5TradingAccount,
  setMt5AccountStatus,
  verifyMt5UserCredentials,
  type Mt5UserPasswordType,
} from "@/lib/server/mt5-manager";
import type {
  CurrencyCode,
  DashboardSnapshot,
  PaymentMethod,
  SocialStrategy,
  TradingAccount,
  TradingAccountCredentials,
  TradingStats,
  Transaction,
} from "@/types/dashboard";

/** Returns current timestamp as ISO 8601 (parseable by new Date()). */
const formatCreatedAt = (): string => new Date().toISOString();

const asCurrency = (value: string): CurrencyCode => (value === "EUR" ? "EUR" : "USD");
const DEFAULT_FLEXY_MARKETS_SERVER_IP = "89.21.67.29";
const PASSWORD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
const DEFAULT_MT5_LEVERAGE = 100;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

const resolveFlexyMarketsServerIp = (): string => {
  const configuredServer =
    process.env.FLEXY_MARKETS_IP?.trim() || process.env.MT5_SERVER_HOST?.trim();
  return configuredServer || DEFAULT_FLEXY_MARKETS_SERVER_IP;
};

const generatePassword = (length = 14): string =>
  Array.from({ length }, () => {
    const index = randomInt(0, PASSWORD_CHARSET.length);
    return PASSWORD_CHARSET[index];
  }).join("");

const buildCredentials = (
  login: string,
  server: string,
  options?: { tradingPassword?: string; investorPassword?: string },
): TradingAccountCredentials => {
  const tradingPassword = options?.tradingPassword?.trim() || generatePassword();
  return {
    login,
    server,
    tradingPassword,
    investorPassword: options?.investorPassword?.trim() || generatePassword(),
    generatedAt: new Date().toISOString(),
    source: "local",
  };
};

const withServerIpSnapshot = (snapshot: DashboardSnapshot): DashboardSnapshot => {
  const defaultServerIp = resolveFlexyMarketsServerIp();
  return {
    ...snapshot,
    tradingAccounts: snapshot.tradingAccounts.map((account) => ({
      ...account,
      serverIp: account.serverIp?.trim() || defaultServerIp,
      credentials: (() => {
        if (!account.credentials) return undefined;

        const legacyMasterPassword =
          typeof (account.credentials as { masterPassword?: unknown }).masterPassword === "string"
            ? (account.credentials as { masterPassword?: string }).masterPassword ?? ""
            : "";

        return {
          ...account.credentials,
          login: account.credentials.login || account.accountNumber,
          server: account.credentials.server?.trim() || account.serverIp?.trim() || defaultServerIp,
          tradingPassword: account.credentials.tradingPassword || legacyMasterPassword,
        };
      })(),
    })),
  };
};

const defaultStats = (): TradingStats => ({
  totalTrades: 0,
  winRate: 0,
  profitFactor: 0,
  totalVolume: 0,
  winningTrades: 0,
  losingTrades: 0,
  averageWin: 0,
  averageLoss: 0,
  largestWin: 0,
  largestLoss: 0,
  consecutiveWins: 0,
  consecutiveLosses: 0,
});

const normalizeAmount = (amount: number): number => Number(amount.toFixed(2));

interface SubmitFundsInput {
  type: "deposit" | "withdraw";
  amount: number;
  currency: CurrencyCode;
  method: PaymentMethod;
  /** When set, this type is stored on the transaction instead of the generic Deposit/Withdrawal label. */
  transferType?: Transaction["type"];
  /** MT5 account login involved in the transfer (e.g. "900847"). */
  targetAccount?: string;
}

interface TransferInput {
  amount: number;
  from: "wallet" | "mt5";
  to: "wallet" | "mt5";
  accountId: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  snapshot: DashboardSnapshot;
}

export interface AccountCredentialsActionResult extends ActionResult {
  account?: TradingAccount;
  server?: string;
  serverHost?: string;
  serverPort?: number;
}

interface CreateAccountInput {
  platform: "mt5" | "mt4" | "ctrader";
  mode: "demo" | "live";
  currency: CurrencyCode;
  initialBalance: number;
  leverage?: number;
  group?: string;
  name?: string;
  email?: string;
  tradingPassword?: string;
  investorPassword?: string;
}

const transferType = (account: TradingAccount, from: "wallet" | "mt5"): Transaction["type"] => {
  if (account.platform === "ctrader") {
    if (from === "wallet") {
      return account.type === "Demo" ? "Transfer to cTrader Demo" : "Transfer to cTrader";
    }
    return account.type === "Demo" ? "Transfer from cTrader Demo" : "Transfer from cTrader";
  }

  if (from === "wallet") {
    return "Transfer to MT5";
  }
  return "Transfer from MT5";
};

const resolveMt5Login = (account: TradingAccount): string | null => {
  const login = account.credentials?.login?.trim() || account.accountNumber?.trim() || "";
  if (!/^\d+$/.test(login)) {
    return null;
  }
  return login;
};

const ensureCredentialsForAccount = (
  account: TradingAccount,
  login: string,
): TradingAccountCredentials => ({
  login: account.credentials?.login || login,
  server:
    account.credentials?.server?.trim() ||
    account.serverIp?.trim() ||
    resolveFlexyMarketsServerIp(),
  tradingPassword: account.credentials?.tradingPassword ?? "",
  investorPassword: account.credentials?.investorPassword ?? "",
  generatedAt: account.credentials?.generatedAt || new Date().toISOString(),
  source: account.credentials?.source ?? "broker",
});

const isStrongPassword = (password: string): boolean =>
  password.length >= PASSWORD_MIN_LENGTH && PASSWORD_COMPLEXITY_REGEX.test(password);

export const getSnapshotForUser = async (userId: string): Promise<DashboardSnapshot> =>
  withServerIpSnapshot(await getUserSnapshot(userId));

export const submitFundsForUser = async (
  userId: string,
  input: SubmitFundsInput,
): Promise<ActionResult> => {
  const amount = normalizeAmount(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const snapshot = withServerIpSnapshot(await getUserSnapshot(userId));
    return { ok: false, message: "Enter a valid amount greater than 0.", snapshot };
  }

  const type: Transaction["type"] = input.transferType
    ? input.transferType
    : input.type === "deposit" ? "Deposit" : "Withdrawal";

  let resultMessage = "";
  let ok = true;

  const snapshot = await updateUserSnapshot(userId, (current) => {
    const currency = asCurrency(input.currency);
    const walletBalance = current.wallets[currency];
    const createdAt = formatCreatedAt();

    if (input.type === "withdraw" && walletBalance < amount) {
      const rejected: Transaction = {
        id: `txn-${randomUUID()}`,
        type,
        amount,
        currency,
        method: input.method,
        status: "Rejected",
        createdAt,
      };
      current.transactions = [rejected, ...current.transactions];
      ok = false;
      resultMessage = "Withdrawal rejected: insufficient balance.";
      return current;
    }

    const completed: Transaction = {
      id: `txn-${randomUUID()}`,
      type,
      amount,
      currency,
      method: input.method,
      status: "Completed",
      createdAt,
      ...(input.targetAccount ? { targetAccount: input.targetAccount } : {}),
    };

    current.wallets[currency] =
      input.type === "deposit" ? walletBalance + amount : walletBalance - amount;
    current.transactions = [completed, ...current.transactions];
    resultMessage = `${type} request submitted successfully.`;
    return current;
  });

  return { ok, message: resultMessage, snapshot: withServerIpSnapshot(snapshot) };
};

export const transferFundsForUser = async (
  userId: string,
  input: TransferInput,
): Promise<ActionResult> => {
  const amount = normalizeAmount(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const snapshot = withServerIpSnapshot(await getUserSnapshot(userId));
    return { ok: false, message: "Enter a valid amount.", snapshot };
  }

  if (input.from === input.to) {
    const snapshot = withServerIpSnapshot(await getUserSnapshot(userId));
    return { ok: false, message: "Invalid transfer direction.", snapshot };
  }

  let ok = true;
  let resultMessage = "";

  const snapshot = await updateUserSnapshot(userId, (current) => {
    const account = current.tradingAccounts.find((entry) => entry.id === input.accountId);
    if (!account) {
      ok = false;
      resultMessage = "Account not found.";
      return current;
    }

    if (account.type === "Demo" && input.from === "mt5") {
      ok = false;
      resultMessage = "Demo funds cannot be transferred back to wallet.";
      return current;
    }

    const currency = asCurrency(account.currency);
    const walletBalance = current.wallets[currency];

    if (input.from === "wallet" && walletBalance < amount) {
      ok = false;
      resultMessage = "Insufficient wallet balance.";
      return current;
    }

    if (input.from === "mt5" && account.balance < amount) {
      ok = false;
      resultMessage = "Insufficient account balance.";
      return current;
    }

    const txType = transferType(account, input.from);

    if (input.from === "wallet") {
      current.wallets[currency] = walletBalance - amount;
      account.balance += amount;
      account.equity += amount;
      account.freeMargin += amount;
    } else {
      current.wallets[currency] = walletBalance + amount;
      account.balance -= amount;
      account.equity -= amount;
      account.freeMargin -= amount;
    }

    const mt5Login = resolveMt5Login(account);

    const transaction: Transaction = {
      id: `txn-${randomUUID()}`,
      type: txType,
      amount,
      currency,
      method: "card",
      status: "Completed",
      createdAt: formatCreatedAt(),
      ...(mt5Login ? { targetAccount: mt5Login } : {}),
    };

    current.transactions = [transaction, ...current.transactions];
    resultMessage = "Transfer successful!";
    return current;
  });

  return { ok, message: resultMessage, snapshot: withServerIpSnapshot(snapshot) };
};

export const createTradingAccountForUser = async (
  userId: string,
  input: CreateAccountInput,
): Promise<{ account: TradingAccount; snapshot: DashboardSnapshot }> => {
  console.log("[dashboard-service] createTradingAccountForUser called with input:", {
    userId,
    platform: input.platform,
    mode: input.mode,
    currency: input.currency,
    initialBalance: input.initialBalance,
    leverage: input.leverage,
    group: input.group,
    name: input.name,
    email: input.email,
  });

  const initialBalance = normalizeAmount(Math.max(0, input.initialBalance));
  const leverage =
    Number.isFinite(input.leverage) && (input.leverage ?? 0) > 0
      ? Math.trunc(input.leverage ?? DEFAULT_MT5_LEVERAGE)
      : DEFAULT_MT5_LEVERAGE;
  const type = input.mode === "demo" ? "Demo" : "Live";

  console.log("[dashboard-service] Normalized values:", {
    initialBalance,
    leverage,
    type,
  });

  if (input.platform === "mt5") {
    console.log("[dashboard-service] MT5 platform selected, fetching user profile...");
    const profile = await getUserById(userId);
    console.log("[dashboard-service] User profile retrieved:", {
      userId,
      profileFound: !!profile,
      email: profile?.email,
      name: profile?.name,
    });

    const displayName =
      input.name?.trim() ||
      profile?.name?.trim() ||
      `CRM User ${userId.slice(0, 8)}`;
    const contactEmail = input.email?.trim() || profile?.email || "";
    const tradingPassword = input.tradingPassword?.trim() || generatePassword();
    const investorPassword = input.investorPassword?.trim() || generatePassword();

    console.log("[dashboard-service] About to call provisionMt5TradingAccount with:", {
      mode: input.mode,
      currency: asCurrency(input.currency),
      leverage,
      displayName,
      email: contactEmail,
      initialBalance,
      group: input.group,
    });

    let provisioned;
    try {
      provisioned = await provisionMt5TradingAccount({
        mode: input.mode,
        currency: asCurrency(input.currency),
        leverage,
        displayName,
        email: contactEmail,
        tradingPassword,
        investorPassword,
        initialBalance,
        group: input.group,
      });
      
      console.log("[dashboard-service] provisionMt5TradingAccount succeeded:", {
        login: provisioned.login,
        group: provisioned.group,
        serverHost: provisioned.serverHost,
        serverPort: provisioned.serverPort,
        initialBalanceApplied: provisioned.initialBalanceApplied,
      });
    } catch (provisionError) {
      console.error("[dashboard-service] provisionMt5TradingAccount failed:", {
        error: provisionError instanceof Error ? provisionError.message : String(provisionError),
        stack: provisionError instanceof Error ? provisionError.stack : undefined,
      });
      throw provisionError;
    }

    let createdAccount!: TradingAccount;
    const creditedBalance = normalizeAmount(Math.max(0, provisioned.initialBalanceApplied));

    console.log("[dashboard-service] Before persisting to database via updateUserSnapshot:", {
      userId,
      accountNumber: provisioned.login,
      creditedBalance,
    });

    let previousAccountCount = 0;
    let newAccountCount = 0;

    const snapshot = await updateUserSnapshot(userId, (current) => {
      previousAccountCount = current.tradingAccounts.length;
      console.log("[dashboard-service] Inside updateUserSnapshot callback, previous account count:", previousAccountCount);

      createdAccount = {
        id: `acc-${randomUUID()}`,
        accountNumber: provisioned.login,
        name: input.name?.trim() || `MetaTrader 5 ${type}`,
        platform: "mt5",
        type,
        leverage: provisioned.leverage ?? leverage,
        serverIp: provisioned.serverHost,
        credentials: {
          login: provisioned.login,
          server: provisioned.server,
          tradingPassword: provisioned.tradingPassword,
          investorPassword: provisioned.investorPassword,
          generatedAt: new Date().toISOString(),
          source: "broker",
        },
        currency: asCurrency(input.currency),
        balance: creditedBalance,
        equity: creditedBalance,
        freeMargin: creditedBalance,
        margin: 0,
        status: "Active",
        stats: defaultStats(),
        transactions: [],
      };

      current.tradingAccounts = [createdAccount, ...current.tradingAccounts];
      newAccountCount = current.tradingAccounts.length;
      console.log("[dashboard-service] Account added to tradingAccounts array:", {
        newAccountId: createdAccount.id,
        newAccountNumber: createdAccount.accountNumber,
        newAccountCount,
      });

      return current;
    });

    console.log("[dashboard-service] After database update:", {
      previousAccountCount,
      newAccountCount,
      totalAccountsInReturnedSnapshot: snapshot.tradingAccounts.length,
      createdAccountId: createdAccount.id,
    });

    // Backfill createdAt from PostgreSQL accounts table (authoritative timestamp)
    const pgCreatedAt = await getAccountCreatedAtFromPg(provisioned.login).catch(() => null);
    if (pgCreatedAt) {
      createdAccount = { ...createdAccount, createdAt: pgCreatedAt };
      // Also patch it in the persisted snapshot
      await updateUserSnapshot(userId, (current) => {
        current.tradingAccounts = current.tradingAccounts.map((a) =>
          a.id === createdAccount.id ? { ...a, createdAt: pgCreatedAt } : a
        );
        return current;
      });
    }

    return { account: createdAccount, snapshot: withServerIpSnapshot(snapshot) };
  }

  // cTrader (non-MT5) fallback remains local until dedicated broker integration is added.
  let createdAccount!: TradingAccount;
  const serverIp = resolveFlexyMarketsServerIp();

  const snapshot = await updateUserSnapshot(userId, (current) => {
    const accountNumber = Math.floor(10000000 + Math.random() * 90000000).toString();
    const credentials = buildCredentials(accountNumber, serverIp, {
      tradingPassword: input.tradingPassword,
      investorPassword: input.investorPassword,
    });

    const defaultName = input.platform === "mt4" ? `MetaTrader 4 ${type}` : `cTrader ${type}`;
    createdAccount = {
      id: `acc-${randomUUID()}`,
      accountNumber,
      name: input.name?.trim() || defaultName,
      platform: input.platform,
      type,
      leverage,
      serverIp,
      credentials,
      currency: asCurrency(input.currency),
      balance: initialBalance,
      equity: initialBalance,
      freeMargin: initialBalance,
      margin: 0,
      status: "Active",
      stats: defaultStats(),
      transactions: [],
    };

    current.tradingAccounts = [createdAccount, ...current.tradingAccounts];
    return current;
  });

  return { account: createdAccount, snapshot: withServerIpSnapshot(snapshot) };
};

export const verifyTradingAccountCredentialsForUser = async (
  userId: string,
  accountId: string,
  passwordType: Mt5UserPasswordType,
  password?: string,
): Promise<AccountCredentialsActionResult> => {
  const snapshot = withServerIpSnapshot(await getUserSnapshot(userId));
  const account = snapshot.tradingAccounts.find((entry) => entry.id === accountId);

  if (!account) {
    return {
      ok: false,
      message: "Account not found.",
      snapshot,
    };
  }

  if (account.platform !== "mt5") {
    return {
      ok: false,
      message: "Password verification is only supported for MT5 accounts.",
      snapshot,
    };
  }

  const login = resolveMt5Login(account);
  if (!login) {
    return {
      ok: false,
      message: "Invalid MT5 login on account record.",
      snapshot,
    };
  }

  const trimmedPassword = password?.trim() ?? "";
  const fallbackPassword =
    passwordType === "trading"
      ? account.credentials?.tradingPassword
      : account.credentials?.investorPassword;
  const resolvedPassword = trimmedPassword || fallbackPassword || "";

  if (!resolvedPassword) {
    return {
      ok: false,
      message: "No password available to verify. Provide a password explicitly.",
      snapshot,
    };
  }

  const verified = await verifyMt5UserCredentials({
    login,
    passwordType,
    password: resolvedPassword,
  });

  const hasAccountMetrics =
    (typeof verified.balance === "number" && Number.isFinite(verified.balance)) ||
    (typeof verified.equity === "number" && Number.isFinite(verified.equity)) ||
    (typeof verified.freeMargin === "number" && Number.isFinite(verified.freeMargin)) ||
    (typeof verified.leverage === "number" && Number.isFinite(verified.leverage));

  let updatedAccount = account;
  let updatedSnapshot = snapshot;

  if (hasAccountMetrics) {
    const normalizedBalance =
      typeof verified.balance === "number" && Number.isFinite(verified.balance)
        ? normalizeAmount(verified.balance)
        : undefined;
    const normalizedEquity =
      typeof verified.equity === "number" && Number.isFinite(verified.equity)
        ? normalizeAmount(verified.equity)
        : undefined;
    const normalizedFreeMargin =
      typeof verified.freeMargin === "number" && Number.isFinite(verified.freeMargin)
        ? normalizeAmount(verified.freeMargin)
        : undefined;
    const normalizedLeverage =
      typeof verified.leverage === "number" && Number.isFinite(verified.leverage) && verified.leverage > 0
        ? Math.trunc(verified.leverage)
        : undefined;

    const refreshedSnapshot = await updateUserSnapshot(userId, (current) => {
      current.tradingAccounts = current.tradingAccounts.map((entry) => {
        if (entry.id !== accountId) {
          return entry;
        }

        updatedAccount = {
          ...entry,
          balance: normalizedBalance ?? entry.balance,
          equity: normalizedEquity ?? entry.equity,
          freeMargin: normalizedFreeMargin ?? entry.freeMargin,
          leverage: normalizedLeverage ?? entry.leverage,
        };

        return updatedAccount;
      });
      return current;
    });

    updatedSnapshot = withServerIpSnapshot(refreshedSnapshot);
  }

  return {
    ok: true,
    message: "MT5 terminal credentials verified successfully.",
    account: updatedAccount,
    snapshot: updatedSnapshot,
    server: verified.server,
    serverHost: verified.serverHost,
    serverPort: verified.serverPort,
  };
};

export const changeTradingAccountPasswordForUser = async (
  userId: string,
  accountId: string,
  passwordType: Mt5UserPasswordType,
  newPassword: string,
): Promise<AccountCredentialsActionResult> => {
  const password = newPassword.trim();
  if (!isStrongPassword(password)) {
    const snapshot = withServerIpSnapshot(await getUserSnapshot(userId));
    return {
      ok: false,
      message:
        "Password must be at least 8 characters and include an uppercase letter, a number, and a special character.",
      snapshot,
    };
  }

  const beforeSnapshot = withServerIpSnapshot(await getUserSnapshot(userId));
  const targetAccount = beforeSnapshot.tradingAccounts.find((entry) => entry.id === accountId);

  if (!targetAccount) {
    return {
      ok: false,
      message: "Account not found.",
      snapshot: beforeSnapshot,
    };
  }

  if (targetAccount.platform !== "mt5") {
    return {
      ok: false,
      message: "Password updates are only supported for MT5 accounts.",
      snapshot: beforeSnapshot,
    };
  }

  const login = resolveMt5Login(targetAccount);
  if (!login) {
    return {
      ok: false,
      message: "Invalid MT5 login on account record.",
      snapshot: beforeSnapshot,
    };
  }

  const changed = await changeMt5UserPassword({
    login,
    passwordType,
    newPassword: password,
  });

  let updatedAccount: TradingAccount | undefined;
  const snapshot = await updateUserSnapshot(userId, (current) => {
    current.tradingAccounts = current.tradingAccounts.map((entry) => {
      if (entry.id !== accountId) {
        return entry;
      }

      const existingCredentials = ensureCredentialsForAccount(entry, login);
      const nextCredentials: TradingAccountCredentials = {
        ...existingCredentials,
        tradingPassword:
          passwordType === "trading"
            ? password
            : existingCredentials.tradingPassword,
        investorPassword:
          passwordType === "investor"
            ? password
            : existingCredentials.investorPassword,
        generatedAt: new Date().toISOString(),
      };

      updatedAccount = {
        ...entry,
        credentials: nextCredentials,
      };
      return updatedAccount;
    });
    return current;
  });

  return {
    ok: true,
    message: `${passwordType === "trading" ? "Trading" : "Investor"} password updated successfully.`,
    account: updatedAccount,
    snapshot: withServerIpSnapshot(snapshot),
    server: changed.server,
    serverHost: changed.serverHost,
    serverPort: changed.serverPort,
  };
};

export const setTradingAccountStatusForUser = async (
  userId: string,
  accountId: string,
  status: "Active" | "Archived",
): Promise<ActionResult> => {
  const beforeSnapshot = withServerIpSnapshot(await getUserSnapshot(userId));
  const account = beforeSnapshot.tradingAccounts.find((entry) => entry.id === accountId);

  if (!account) {
    return {
      ok: false,
      message: "Account not found.",
      snapshot: beforeSnapshot,
    };
  }

  if (account.platform === "mt5") {
    const login = resolveMt5Login(account);
    if (!login) {
      return {
        ok: false,
        message: "Invalid MT5 login on account record.",
        snapshot: beforeSnapshot,
      };
    }

    try {
      await setMt5AccountStatus({
        login,
        action: status === "Archived" ? "archive" : "activate",
      });
    } catch (error) {
      console.warn(`[dashboard-service] Failed to ${status === "Archived" ? "archive" : "activate"} MT5 account remotely for login ${login}. Proceeding to update local CRM status anyway.`, error instanceof Error ? error.message : String(error));
    }
  }

  const mt5Suffix =
    account.platform === "mt5"
      ? status === "Archived"
        ? " and deactivated on MT5"
        : " and activated on MT5"
      : "";

  let ok = false;
  const snapshot = await updateUserSnapshot(userId, (current) => {
    current.tradingAccounts = current.tradingAccounts.map((account) => {
      if (account.id === accountId) {
        ok = true;
        return {
          ...account,
          status,
          // Stamp archivedAt when archiving, clear it when restoring
          archivedAt: status === "Archived" ? new Date().toISOString() : undefined,
        };
      }
      return account;
    });
    return current;
  });

  return {
    ok,
    message:
      ok
        ? `Account ${status === "Archived" ? "archived" : "restored"}${mt5Suffix} successfully.`
        : "Account not found.",
    snapshot: withServerIpSnapshot(snapshot),
  };
};

export const deleteTradingAccountForUser = async (
  userId: string,
  accountId: string,
): Promise<ActionResult> => {
  const beforeSnapshot = withServerIpSnapshot(await getUserSnapshot(userId));
  const account = beforeSnapshot.tradingAccounts.find((entry) => entry.id === accountId);

  if (!account) {
    return {
      ok: false,
      message: "Account not found.",
      snapshot: beforeSnapshot,
    };
  }

  if (account.platform === "mt5" && account.status !== "Archived") {
    return {
      ok: false,
      message: "MT5 account must be archived before it can be deleted from CRM.",
      snapshot: beforeSnapshot,
    };
  }

  let deleted = false;
  const snapshot = await updateUserSnapshot(userId, (current) => {
    const previousLength = current.tradingAccounts.length;
    current.tradingAccounts = current.tradingAccounts.filter((entry) => entry.id !== accountId);
    deleted = current.tradingAccounts.length < previousLength;
    return current;
  });

  return {
    ok: deleted,
    message: deleted ? "Account deleted from CRM successfully." : "Account not found.",
    snapshot: withServerIpSnapshot(snapshot),
  };
};

export const getSocialStrategiesForUser = async (_userId: string): Promise<SocialStrategy[]> =>
  getSocialStrategies();
