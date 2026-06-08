import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import type { CurrencyCode } from "@/types/dashboard";

export interface ProvisionMt5AccountInput {
  mode: "demo" | "live";
  currency: CurrencyCode;
  group?: string;
  leverage: number;
  displayName: string;
  email?: string;
  tradingPassword: string;
  investorPassword: string;
  initialBalance: number;
}

export interface ProvisionMt5AccountResult {
  login: string;
  group: string;
  server: string;
  serverHost: string;
  serverPort: number;
  leverage: number;
  tradingPassword: string;
  investorPassword: string;
  initialBalanceAsked: number;
  initialBalanceApplied: number;
  depositCode: string;
  dealTicket: string;
}

export type Mt5UserPasswordType = "trading" | "investor";
export type Mt5AccountStatusAction = "archive" | "activate";

interface Mt5CredentialsPayload {
  ok: boolean;
  action?: "verify" | "change";
  login?: string;
  passwordType?: Mt5UserPasswordType;
  server?: string;
  serverHost?: string;
  serverPort?: number;
  balance?: number;
  equity?: number;
  freeMargin?: number;
  leverage?: number;
  stage?: string;
  code?: string;
  message?: string;
}

interface Mt5StatusPayload {
  ok: boolean;
  action?: Mt5AccountStatusAction;
  login?: string;
  previousRights?: number;
  rights?: number;
  verified?: boolean;
  server?: string;
  serverHost?: string;
  serverPort?: number;
  stage?: string;
  code?: string;
  message?: string;
}

export interface VerifyMt5UserCredentialsInput {
  login: string;
  passwordType: Mt5UserPasswordType;
  password: string;
}

export interface VerifyMt5UserCredentialsResult {
  login: string;
  passwordType: Mt5UserPasswordType;
  server: string;
  serverHost: string;
  serverPort: number;
  balance?: number;
  equity?: number;
  freeMargin?: number;
  leverage?: number;
}

export interface ChangeMt5UserPasswordInput {
  login: string;
  passwordType: Mt5UserPasswordType;
  newPassword: string;
}

export interface ChangeMt5UserPasswordResult {
  login: string;
  passwordType: Mt5UserPasswordType;
  server: string;
  serverHost: string;
  serverPort: number;
  balance?: number;
  equity?: number;
  freeMargin?: number;
  leverage?: number;
}

export interface SetMt5AccountStatusInput {
  login: string;
  action: Mt5AccountStatusAction;
}

export interface SetMt5AccountStatusResult {
  login: string;
  action: Mt5AccountStatusAction;
  previousRights?: number;
  rights: number;
  verified: boolean;
  server: string;
  serverHost: string;
  serverPort: number;
}

interface Mt5ProvisioningPayload {
  ok: boolean;
  login?: string;
  group?: string;
  server?: string;
  serverHost?: string;
  serverPort?: number;
  leverage?: number;
  tradingPassword?: string;
  investorPassword?: string;
  initialBalanceAsked?: number;
  initialBalanceApplied?: number;
  depositCode?: string;
  dealTicket?: string;
  stage?: string;
  code?: string;
  message?: string;
}

export class Mt5ProvisioningError extends Error {
  stage?: string;
  code?: string;
  stdout?: string;
  stderr?: string;

  constructor(message: string, options?: Partial<Mt5ProvisioningError>) {
    super(message);
    this.name = "Mt5ProvisioningError";
    this.stage = options?.stage;
    this.code = options?.code;
    this.stdout = options?.stdout;
    this.stderr = options?.stderr;
  }
}

export class Mt5AccountOperationError extends Error {
  stage?: string;
  code?: string;
  stdout?: string;
  stderr?: string;

  constructor(message: string, options?: Partial<Mt5AccountOperationError>) {
    super(message);
    this.name = "Mt5AccountOperationError";
    this.stage = options?.stage;
    this.code = options?.code;
    this.stdout = options?.stdout;
    this.stderr = options?.stderr;
  }
}

const toModeKey = (mode: "demo" | "live"): "DEMO" | "LIVE" =>
  mode === "demo" ? "DEMO" : "LIVE";

const DEFAULT_MT5_SERVER_HOST = "89.21.67.29";

interface ProvisioningOverrides {
  serverHost?: string;
  serverPort?: number;
}

interface CredentialsOverrides {
  serverHost?: string;
  serverPort?: number;
}

const resolveRepoRoot = (): string => {
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === "frontend") {
    return path.dirname(cwd);
  }
  return cwd;
};

const resolveBackendScriptPath = (): string => {
  const repoRoot = resolveRepoRoot();
  const scriptPath = path.join(repoRoot, "backend", "scripts", "Create-Mt5TradingAccount.ps1");
  if (!existsSync(scriptPath)) {
    throw new Mt5ProvisioningError(
      `MT5 provisioning script not found at ${scriptPath}.`,
      { code: "SCRIPT_NOT_FOUND", stage: "resolve_script" },
    );
  }
  return scriptPath;
};

const resolveBackendEnvPath = (): string => {
  const repoRoot = resolveRepoRoot();
  const candidatePaths = [
    path.join(repoRoot, "backend", ".env.local"),
    path.join(repoRoot, "backend", ".env"),
  ];

  for (const envPath of candidatePaths) {
    if (existsSync(envPath)) {
      return envPath;
    }
  }

  throw new Mt5ProvisioningError(
    `MT5 environment file not found. Checked: ${candidatePaths.join(", ")}`,
    { code: "ENV_FILE_NOT_FOUND", stage: "resolve_env" },
  );
};

const resolveCredentialsScriptPath = (): string => {
  const repoRoot = resolveRepoRoot();
  const scriptPath = path.join(repoRoot, "frontend", "scripts", "Mt5AccountCredentials.ps1");
  if (!existsSync(scriptPath)) {
    throw new Mt5AccountOperationError(
      `MT5 account credentials script not found at ${scriptPath}.`,
      { code: "SCRIPT_NOT_FOUND", stage: "resolve_script" },
    );
  }
  return scriptPath;
};

const resolveStatusScriptPath = (): string => {
  const repoRoot = resolveRepoRoot();
  const scriptPath = path.join(repoRoot, "frontend", "scripts", "Mt5AccountStatus.ps1");
  if (!existsSync(scriptPath)) {
    throw new Mt5AccountOperationError(
      `MT5 account status script not found at ${scriptPath}.`,
      { code: "SCRIPT_NOT_FOUND", stage: "resolve_script" },
    );
  }
  return scriptPath;
};

const parseJsonFromStdout = <T,>(
  stdout: string,
  stderr: string,
  errorFactory: (message: string, options?: Record<string, string>) => Error,
): T => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw errorFactory("MT5 script returned no output.", {
      code: "EMPTY_OUTPUT",
      stage: "parse_output",
      stdout,
      stderr,
    });
  }

  const lastLine = trimmed.split(/\r?\n/).filter(Boolean).pop() ?? "";
  try {
    return JSON.parse(lastLine) as T;
  } catch {
    throw errorFactory("Failed to parse MT5 script JSON output.", {
      code: "INVALID_JSON_OUTPUT",
      stage: "parse_output",
      stdout,
      stderr,
    });
  }
};

const parseMt5Payload = (stdout: string, stderr: string): Mt5ProvisioningPayload => {
  return parseJsonFromStdout<Mt5ProvisioningPayload>(
    stdout,
    stderr,
    (message, options) =>
      new Mt5ProvisioningError(message, {
        code: options?.code,
        stage: options?.stage,
        stdout: options?.stdout,
        stderr: options?.stderr,
      }),
  );
};

const parseMt5CredentialsPayload = (stdout: string, stderr: string): Mt5CredentialsPayload => {
  return parseJsonFromStdout<Mt5CredentialsPayload>(
    stdout,
    stderr,
    (message, options) =>
      new Mt5AccountOperationError(message, {
        code: options?.code,
        stage: options?.stage,
        stdout: options?.stdout,
        stderr: options?.stderr,
      }),
  );
};

const parseMt5StatusPayload = (stdout: string, stderr: string): Mt5StatusPayload => {
  return parseJsonFromStdout<Mt5StatusPayload>(
    stdout,
    stderr,
    (message, options) =>
      new Mt5AccountOperationError(message, {
        code: options?.code,
        stage: options?.stage,
        stdout: options?.stdout,
        stderr: options?.stderr,
      }),
  );
};

const runPowerShell = async (args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new Mt5ProvisioningError(`Failed to execute PowerShell: ${error.message}`, {
          code: "POWERSHELL_SPAWN_FAILED",
          stage: "spawn",
          stdout,
          stderr,
        }),
      );
    });

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });

const buildProvisioningArgs = (
  scriptPath: string,
  envFile: string,
  input: ProvisionMt5AccountInput,
  overrides?: ProvisioningOverrides,
): string[] => {
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-EnvFile",
    envFile,
    "-Mode",
    toModeKey(input.mode),
    "-Currency",
    input.currency,
    "-Name",
    input.displayName,
    "-Email",
    input.email ?? "",
    "-Leverage",
    String(input.leverage),
    "-TradingPassword",
    input.tradingPassword,
    "-InvestorPassword",
    input.investorPassword,
    "-InitialBalance",
    String(Number(input.initialBalance.toFixed(2))),
  ];

  if (input.group?.trim()) {
    args.push("-Group", input.group.trim());
  }

  if (overrides?.serverHost?.trim()) {
    args.push("-ServerHost", overrides.serverHost.trim());
  }

  if (Number.isFinite(overrides?.serverPort) && (overrides?.serverPort ?? 0) > 0) {
    args.push("-ServerPort", String(Math.trunc(overrides?.serverPort ?? 0)));
  }

  return args;
};

const toProvisioningError = (
  payload: Mt5ProvisioningPayload,
  stdout: string,
  stderr: string,
): Mt5ProvisioningError =>
  new Mt5ProvisioningError(
    payload.message ??
    `MT5 provisioning failed${payload.code ? ` (${payload.code})` : ""}.`,
    {
      stage: payload.stage,
      code: payload.code,
      stdout,
      stderr,
    },
  );

const parseSuccessfulResult = (
  payload: Mt5ProvisioningPayload,
  input: ProvisionMt5AccountInput,
  stdout: string,
  stderr: string,
): ProvisionMt5AccountResult => {
  if (!payload.login || !payload.serverHost || typeof payload.serverPort !== "number") {
    throw new Mt5ProvisioningError("MT5 provisioning returned incomplete account data.", {
      code: "INCOMPLETE_RESULT",
      stage: "validate_output",
      stdout,
      stderr,
    });
  }

  return {
    login: payload.login,
    group: payload.group ?? "",
    server: payload.server ?? payload.serverHost,
    serverHost: payload.serverHost,
    serverPort: payload.serverPort,
    leverage: payload.leverage ?? input.leverage,
    tradingPassword: payload.tradingPassword ?? input.tradingPassword,
    investorPassword: payload.investorPassword ?? input.investorPassword,
    initialBalanceAsked: payload.initialBalanceAsked ?? input.initialBalance,
    initialBalanceApplied: payload.initialBalanceApplied ?? 0,
    depositCode: payload.depositCode ?? "unknown",
    dealTicket: payload.dealTicket ?? "",
  };
};

const normalizeLogin = (login: string): string => {
  const value = login.trim();
  if (!/^\d+$/.test(value)) {
    throw new Mt5AccountOperationError("MT5 login must be numeric.", {
      stage: "validate_input",
      code: "INVALID_LOGIN",
    });
  }
  return value;
};

const buildCredentialsArgs = (
  scriptPath: string,
  envFile: string,
  login: string,
  passwordType: Mt5UserPasswordType,
  password: string,
  action: "verify" | "change",
  overrides?: CredentialsOverrides,
): string[] => {
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-EnvFile",
    envFile,
    "-Action",
    action,
    "-Login",
    normalizeLogin(login),
    "-PasswordType",
    passwordType,
    "-Password",
    password,
  ];

  if (overrides?.serverHost?.trim()) {
    args.push("-ServerHost", overrides.serverHost.trim());
  }

  if (Number.isFinite(overrides?.serverPort) && (overrides?.serverPort ?? 0) > 0) {
    args.push("-ServerPort", String(Math.trunc(overrides?.serverPort ?? 0)));
  }

  return args;
};

const toAccountOperationError = (
  payload: Mt5CredentialsPayload,
  stdout: string,
  stderr: string,
): Mt5AccountOperationError =>
  new Mt5AccountOperationError(
    payload.message ??
    `MT5 account operation failed${payload.code ? ` (${payload.code})` : ""}.`,
    {
      stage: payload.stage,
      code: payload.code,
      stdout,
      stderr,
    },
  );

const parseCredentialsResult = (
  payload: Mt5CredentialsPayload,
  stdout: string,
  stderr: string,
): VerifyMt5UserCredentialsResult | ChangeMt5UserPasswordResult => {
  if (!payload.login || !payload.serverHost || typeof payload.serverPort !== "number") {
    throw new Mt5AccountOperationError("MT5 credentials operation returned incomplete data.", {
      code: "INCOMPLETE_RESULT",
      stage: "validate_output",
      stdout,
      stderr,
    });
  }

  const passwordType =
    payload.passwordType === "investor" ? "investor" : "trading";

  return {
    login: payload.login,
    passwordType,
    server: payload.server ?? payload.serverHost,
    serverHost: payload.serverHost,
    serverPort: payload.serverPort,
    balance: typeof payload.balance === "number" ? payload.balance : undefined,
    equity: typeof payload.equity === "number" ? payload.equity : undefined,
    freeMargin: typeof payload.freeMargin === "number" ? payload.freeMargin : undefined,
    leverage: typeof payload.leverage === "number" ? Math.trunc(payload.leverage) : undefined,
  };
};

const buildStatusArgs = (
  scriptPath: string,
  envFile: string,
  input: SetMt5AccountStatusInput,
  overrides?: CredentialsOverrides,
): string[] => {
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-EnvFile",
    envFile,
    "-Action",
    input.action,
    "-Login",
    normalizeLogin(input.login),
  ];

  if (overrides?.serverHost?.trim()) {
    args.push("-ServerHost", overrides.serverHost.trim());
  }

  if (Number.isFinite(overrides?.serverPort) && (overrides?.serverPort ?? 0) > 0) {
    args.push("-ServerPort", String(Math.trunc(overrides?.serverPort ?? 0)));
  }

  return args;
};

const toStatusOperationError = (
  payload: Mt5StatusPayload,
  stdout: string,
  stderr: string,
): Mt5AccountOperationError =>
  new Mt5AccountOperationError(
    payload.message ??
    `MT5 account status operation failed${payload.code ? ` (${payload.code})` : ""}.`,
    {
      stage: payload.stage,
      code: payload.code,
      stdout,
      stderr,
    },
  );

const parseStatusResult = (
  payload: Mt5StatusPayload,
  stdout: string,
  stderr: string,
): SetMt5AccountStatusResult => {
  if (
    !payload.login ||
    !payload.action ||
    !payload.serverHost ||
    typeof payload.serverPort !== "number" ||
    typeof payload.rights !== "number"
  ) {
    throw new Mt5AccountOperationError("MT5 account status operation returned incomplete data.", {
      code: "INCOMPLETE_RESULT",
      stage: "validate_output",
      stdout,
      stderr,
    });
  }

  return {
    login: payload.login,
    action: payload.action,
    previousRights:
      typeof payload.previousRights === "number" ? payload.previousRights : undefined,
    rights: payload.rights,
    verified: payload.verified !== false,
    server: payload.server ?? payload.serverHost,
    serverHost: payload.serverHost,
    serverPort: payload.serverPort,
  };
};

const runCredentialsAttempt = async (
  scriptPath: string,
  envFile: string,
  input: VerifyMt5UserCredentialsInput | ChangeMt5UserPasswordInput,
  action: "verify" | "change",
  overrides?: CredentialsOverrides,
): Promise<VerifyMt5UserCredentialsResult | ChangeMt5UserPasswordResult> => {
  const password =
    action === "verify"
      ? (input as VerifyMt5UserCredentialsInput).password
      : (input as ChangeMt5UserPasswordInput).newPassword;

  let execution;
  try {
    execution = await runPowerShell(
      buildCredentialsArgs(
        scriptPath,
        envFile,
        input.login,
        input.passwordType,
        password,
        action,
        overrides,
      ),
    );
  } catch (error) {
    if (error instanceof Mt5ProvisioningError) {
      throw new Mt5AccountOperationError(error.message, {
        code: error.code,
        stage: error.stage,
        stdout: error.stdout,
        stderr: error.stderr,
      });
    }
    throw error;
  }

  const { exitCode, stdout, stderr } = execution;
  const payload = parseMt5CredentialsPayload(stdout, stderr);

  if (!payload.ok) {
    throw toAccountOperationError(payload, stdout, stderr);
  }

  if (exitCode !== 0) {
    throw new Mt5AccountOperationError(
      `MT5 account credentials script exited with code ${exitCode}.`,
      {
        code: "NON_ZERO_EXIT",
        stage: "script_exit",
        stdout,
        stderr,
      },
    );
  }

  return parseCredentialsResult(payload, stdout, stderr);
};

const runStatusAttempt = async (
  scriptPath: string,
  envFile: string,
  input: SetMt5AccountStatusInput,
  overrides?: CredentialsOverrides,
): Promise<SetMt5AccountStatusResult> => {
  let execution;
  try {
    execution = await runPowerShell(
      buildStatusArgs(
        scriptPath,
        envFile,
        input,
        overrides,
      ),
    );
  } catch (error) {
    if (error instanceof Mt5ProvisioningError) {
      throw new Mt5AccountOperationError(error.message, {
        code: error.code,
        stage: error.stage,
        stdout: error.stdout,
        stderr: error.stderr,
      });
    }
    throw error;
  }

  const { exitCode, stdout, stderr } = execution;
  const payload = parseMt5StatusPayload(stdout, stderr);

  if (!payload.ok) {
    throw toStatusOperationError(payload, stdout, stderr);
  }

  if (exitCode !== 0) {
    throw new Mt5AccountOperationError(
      `MT5 account status script exited with code ${exitCode}.`,
      {
        code: "NON_ZERO_EXIT",
        stage: "script_exit",
        stdout,
        stderr,
      },
    );
  }

  return parseStatusResult(payload, stdout, stderr);
};

const runProvisioningAttempt = async (
  scriptPath: string,
  envFile: string,
  input: ProvisionMt5AccountInput,
  overrides?: ProvisioningOverrides,
): Promise<ProvisionMt5AccountResult> => {
  const args = buildProvisioningArgs(scriptPath, envFile, input, overrides);
  console.log("[mt5-manager] runProvisioningAttempt - PowerShell args built:", {
    scriptPath,
    envFile,
    overrides,
    argsLength: args.length,
  });

  console.log("[mt5-manager] runProvisioningAttempt - Executing PowerShell...");
  const { exitCode, stdout, stderr } = await runPowerShell(args);
  console.log("[mt5-manager] runProvisioningAttempt - PowerShell execution completed:", {
    exitCode,
    stdoutLength: stdout?.length ?? 0,
    stderrLength: stderr?.length ?? 0,
    stdoutPreview: stdout?.substring(0, 500),
    stderrPreview: stderr?.substring(0, 500),
  });

  const payload = parseMt5Payload(stdout, stderr);
  console.log("[mt5-manager] runProvisioningAttempt - Payload parsed:", {
    ok: payload.ok,
    login: payload.login,
    code: payload.code,
    stage: payload.stage,
    message: payload.message,
  });

  if (!payload.ok) {
    console.error("[mt5-manager] runProvisioningAttempt - Payload not ok, throwing error");
    throw toProvisioningError(payload, stdout, stderr);
  }

  if (exitCode !== 0) {
    console.error("[mt5-manager] runProvisioningAttempt - Non-zero exit code:", exitCode);
    throw new Mt5ProvisioningError(
      `MT5 provisioning script exited with code ${exitCode}.`,
      {
        code: "NON_ZERO_EXIT",
        stage: "script_exit",
        stdout,
        stderr,
      },
    );
  }

  const result = parseSuccessfulResult(payload, input, stdout, stderr);
  console.log("[mt5-manager] runProvisioningAttempt - Result parsed successfully:", {
    login: result.login,
    group: result.group,
    serverHost: result.serverHost,
  });

  return result;
};

const resolveFallbackHosts = (): string[] => {
  const currentHost = process.env.MT5_SERVER_HOST?.trim() ?? "";
  const configuredFallbacks = (process.env.MT5_SERVER_HOST_FALLBACKS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const candidates = [...configuredFallbacks, DEFAULT_MT5_SERVER_HOST];
  return [...new Set(candidates)].filter((host) => host !== currentHost);
};

const resolveServerPort = (): number => {
  const configuredPort = Number(process.env.MT5_SERVER_PORT ?? "443");
  return Number.isFinite(configuredPort) && configuredPort > 0
    ? Math.trunc(configuredPort)
    : 443;
};

const runCredentialsWithFallback = async (
  input: VerifyMt5UserCredentialsInput | ChangeMt5UserPasswordInput,
  action: "verify" | "change",
): Promise<VerifyMt5UserCredentialsResult | ChangeMt5UserPasswordResult> => {
  const scriptPath = resolveCredentialsScriptPath();
  let envFile: string;

  try {
    envFile = resolveBackendEnvPath();
  } catch (error) {
    if (error instanceof Mt5ProvisioningError) {
      throw new Mt5AccountOperationError(error.message, {
        code: error.code,
        stage: error.stage,
        stdout: error.stdout,
        stderr: error.stderr,
      });
    }
    throw error;
  }

  try {
    return await runCredentialsAttempt(scriptPath, envFile, input, action);
  } catch (error) {
    if (!(error instanceof Mt5AccountOperationError) || error.code !== "MT_RET_ERR_NETWORK") {
      throw error;
    }

    const fallbackHosts = resolveFallbackHosts();
    const serverPort = resolveServerPort();

    let lastError: Mt5AccountOperationError = error;
    for (const serverHost of fallbackHosts) {
      try {
        return await runCredentialsAttempt(scriptPath, envFile, input, action, {
          serverHost,
          serverPort,
        });
      } catch (retryError) {
        if (retryError instanceof Mt5AccountOperationError) {
          lastError = retryError;
          continue;
        }
        throw retryError;
      }
    }

    throw lastError;
  }
};

const runStatusWithFallback = async (
  input: SetMt5AccountStatusInput,
): Promise<SetMt5AccountStatusResult> => {
  const scriptPath = resolveStatusScriptPath();
  let envFile: string;

  try {
    envFile = resolveBackendEnvPath();
  } catch (error) {
    if (error instanceof Mt5ProvisioningError) {
      throw new Mt5AccountOperationError(error.message, {
        code: error.code,
        stage: error.stage,
        stdout: error.stdout,
        stderr: error.stderr,
      });
    }
    throw error;
  }

  try {
    return await runStatusAttempt(scriptPath, envFile, input);
  } catch (error) {
    if (!(error instanceof Mt5AccountOperationError) || error.code !== "MT_RET_ERR_NETWORK") {
      throw error;
    }

    const fallbackHosts = resolveFallbackHosts();
    const serverPort = resolveServerPort();

    let lastError: Mt5AccountOperationError = error;
    for (const serverHost of fallbackHosts) {
      try {
        return await runStatusAttempt(scriptPath, envFile, input, {
          serverHost,
          serverPort,
        });
      } catch (retryError) {
        if (retryError instanceof Mt5AccountOperationError) {
          lastError = retryError;
          continue;
        }
        throw retryError;
      }
    }

    throw lastError;
  }
};

console.log("[mt5-manager] Module loaded", {
  host: process.env.MT5_SERVER_HOST,
  port: process.env.MT5_SERVER_PORT,
  hasFallbackHosts: Boolean(process.env.MT5_SERVER_HOST_FALLBACKS?.trim()),
});
export const provisionMt5TradingAccount = async (
  input: ProvisionMt5AccountInput,
): Promise<ProvisionMt5AccountResult> => {
  console.log('[mt5-manager] provisionMt5TradingAccount called with:', {
    mode: input.mode,
    currency: input.currency,
    group: input.group,
    leverage: input.leverage,
    displayName: input.displayName,
    email: input.email,
    initialBalance: input.initialBalance,
  });

  console.log('[mt5-manager] Calling PowerShell MT5 Manager SDK for provisioning', { host: process.env.MT5_SERVER_HOST });

  let scriptPath: string;
  let envFile: string;

  try {
    scriptPath = resolveBackendScriptPath();
    envFile = resolveBackendEnvPath();
    console.log('[mt5-manager] Script paths resolved:', {
      scriptPath,
      envFile,
    });
  } catch (resolveError) {
    console.error('[mt5-manager] Failed to resolve script paths:', {
      error: resolveError instanceof Error ? resolveError.message : String(resolveError),
    });
    throw resolveError;
  }

  try {
    console.log('[mt5-manager] Calling runProvisioningAttempt...');
    const result = await runProvisioningAttempt(scriptPath, envFile, input);
    console.log('[mt5-manager] PowerShell provisioning succeeded:', {
      login: result.login,
      group: result.group,
      serverHost: result.serverHost,
    });
    return result;
  } catch (error) {
    console.error('[mt5-manager] PowerShell provisioning failed:', {
      error: error instanceof Error ? error.message : String(error),
      isMt5ProvisioningError: error instanceof Mt5ProvisioningError,
      code: error instanceof Mt5ProvisioningError ? error.code : undefined,
      stage: error instanceof Mt5ProvisioningError ? error.stage : undefined,
    });

    if (error instanceof Mt5ProvisioningError) {
      if (error.code !== 'MT_RET_ERR_NETWORK') {
        throw error;
      }
    } else {
      throw error;
    }

    const serverPort = resolveServerPort();
    const fallbackHosts = resolveFallbackHosts();

    console.log('[mt5-manager] Attempting fallback hosts:', {
      fallbackHosts,
      serverPort,
    });

    let lastError: Mt5ProvisioningError = error;
    for (const serverHost of fallbackHosts) {
      console.log('[mt5-manager] Trying fallback host:', serverHost);
      try {
        const result = await runProvisioningAttempt(scriptPath, envFile, input, {
          serverHost,
          serverPort,
        });
        console.log('[mt5-manager] Fallback host succeeded:', serverHost);
        return result;
      } catch (retryError) {
        console.error('[mt5-manager] Fallback host failed:', {
          host: serverHost,
          error: retryError instanceof Error ? retryError.message : String(retryError),
        });
        if (retryError instanceof Mt5ProvisioningError) {
          lastError = retryError;
          continue;
        }
        throw retryError;
      }
    }

    console.error('[mt5-manager] All fallback hosts exhausted, throwing last error');
    throw lastError;
  }
};

export const verifyMt5UserCredentials = async (
  input: VerifyMt5UserCredentialsInput,
): Promise<VerifyMt5UserCredentialsResult> => {
  const result = await runCredentialsWithFallback(input, "verify");
  return result as VerifyMt5UserCredentialsResult;
};

export const changeMt5UserPassword = async (
  input: ChangeMt5UserPasswordInput,
): Promise<ChangeMt5UserPasswordResult> => {
  const result = await runCredentialsWithFallback(input, "change");
  return result as ChangeMt5UserPasswordResult;
};

export const setMt5AccountStatus = async (
  input: SetMt5AccountStatusInput,
): Promise<SetMt5AccountStatusResult> => runStatusWithFallback(input);
