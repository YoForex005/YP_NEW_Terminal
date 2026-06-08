# Dominion Markets Dashboard — Frontend Documentation

> **Application Name:** FxTrusts (Dominion Markets Dashboard)
> **Type:** Forex/CFD Broker Client Portal & Trading CRM
> **Brand:** FxTrusts (operated by Vanvest Limited)

---

## SECTION 1: Tech Stack Overview

| Category | Technology | Version |
|---|---|---|
| **Framework** | Next.js (App Router) | ^14.2.29 |
| **Language** | TypeScript | ^5.9.3 |
| **Build Tool** | Next.js built-in (SWC) | — |
| **UI/CSS Framework** | Tailwind CSS + Radix UI primitives + ShadCN-style components | Tailwind ^3.4.17 |
| **State Management** | Zustand (with immer, devtools, persist middleware) | ^5.0.8 |
| **HTTP Client** | Native `fetch` (via Next.js API routes as BFF proxy) | — |
| **Form Library** | Native React controlled forms (no library) | — |
| **Routing** | Next.js App Router (file-system based) | — |
| **Animation** | Framer Motion | ^11.18.2 |
| **Charts** | Recharts | ^2.15.4 |
| **Drag & Drop Grid** | react-grid-layout | ^1.5.3 |
| **Resizable Panels** | react-resizable-panels | ^4.7.3 |
| **Real-time** | socket.io-client | ^4.7.5 |
| **Date Utility** | date-fns | ^4.1.0 |
| **Immutable Updates** | Immer | ^11.1.4 |
| **Theme System** | next-themes | ^0.4.6 |
| **Geo Mapping** | d3-geo + topojson-client + world-atlas | d3-geo ^3.1.1 |
| **Icon Library** | lucide-react | ^0.563.0 |
| **Class Merging** | clsx + tailwind-merge (via `cn()` utility) | clsx ^2.1.1, tw-merge ^2.6.0 |
| **CSS Animation Plugin** | tailwindcss-animate | ^1.0.7 |
| **Variant System** | class-variance-authority (CVA) | ^0.7.1 |

---

## SECTION 2: Project Architecture

### Complete Directory Structure

```
frontend/
├── app/                              # Next.js App Router pages & API routes
│   ├── layout.tsx                    # Root layout (ThemeProvider, AuthProvider, GlobalLayoutWrapper)
│   ├── page.tsx                      # Home page (redirects to /dashboard)
│   ├── globals.css                   # Global CSS with Tailwind directives & CSS variables
│   ├── login/page.tsx                # Login page
│   ├── register/page.tsx             # Registration page
│   ├── dashboard/
│   │   ├── layout.tsx                # Dashboard layout wrapper
│   │   ├── loading.tsx               # Dashboard skeleton loader
│   │   ├── page.tsx                  # Main dashboard with widget grid
│   │   └── profile/page.tsx          # User profile page
│   ├── accounts/page.tsx             # Trading accounts management
│   ├── account-settings/page.tsx     # Individual account settings
│   ├── wallet/
│   │   ├── loading.tsx               # Wallet skeleton loader
│   │   ├── page.tsx                  # Main wallet page
│   │   ├── deposits/page.tsx         # Deposits page
│   │   ├── withdrawals/page.tsx      # Withdrawals page
│   │   ├── transfers/page.tsx        # Transfers page
│   │   ├── history/page.tsx          # Transaction history
│   │   └── crypto/
│   │       ├── page.tsx              # Crypto wallet overview
│   │       └── deposit/page.tsx      # Crypto deposit flow
│   ├── trading/
│   │   ├── loading.tsx               # Trading skeleton loader
│   │   ├── history/page.tsx          # Trading history
│   │   └── performance/page.tsx      # Performance analytics
│   ├── analytics/
│   │   ├── layout.tsx                # Analytics layout wrapper
│   │   ├── loading.tsx               # Analytics skeleton loader
│   │   ├── market-news/page.tsx      # Market news feed
│   │   ├── economic-calendar/page.tsx# Economic calendar
│   │   ├── trading-signals/page.tsx  # Trading signals
│   │   └── analyst-views/page.tsx    # Analyst technical views
│   ├── markets/
│   │   ├── loading.tsx               # Markets skeleton loader
│   │   ├── page.tsx                  # Markets overview
│   │   ├── forex/page.tsx            # Forex pairs listing
│   │   ├── crypto/page.tsx           # Crypto assets listing
│   │   ├── commodities/page.tsx      # Commodities listing
│   │   ├── indices/page.tsx          # Indices listing
│   │   └── stocks/page.tsx           # Stocks listing
│   ├── copy-trading/page.tsx         # Copy trading dashboard
│   ├── social/page.tsx               # Social trading (dynamic import)
│   ├── journal/page.tsx              # Trading journal (dynamic import)
│   ├── money-management/page.tsx     # PAMM/money management
│   ├── support/
│   │   ├── layout.tsx                # Support layout wrapper
│   │   ├── loading.tsx               # Support skeleton loader
│   │   ├── page.tsx                  # Support hub
│   │   └── open-ticket/page.tsx      # Open support ticket
│   ├── settings/
│   │   ├── layout.tsx                # Settings layout wrapper
│   │   ├── loading.tsx               # Settings skeleton loader
│   │   ├── profile/page.tsx          # Profile settings
│   │   ├── security/page.tsx         # Security settings
│   │   └── trading-terminal/page.tsx # Trading terminal preferences
│   ├── webtrader/
│   │   ├── layout.tsx                # WebTrader layout (standalone)
│   │   ├── page.tsx                  # WebTrader terminal
│   │   └── login/page.tsx            # MT5 login
│   ├── notifications/page.tsx        # Notifications center
│   ├── rewards/page.tsx              # Loyalty rewards & tiers
│   ├── invite-friends/page.tsx       # Referral program
│   ├── partner-dashboard/page.tsx    # IB/Partner dashboard
│   ├── platforms/page.tsx            # Platform downloads
│   ├── premium/page.tsx              # Premium account tiers
│   ├── vps/page.tsx                  # VPS hosting plans
│   ├── education/page.tsx            # FxTrusts Academy
│   ├── conditions/page.tsx           # Trading conditions
│   ├── conversion-rates/page.tsx     # Currency conversion rates
│   ├── open-account/
│   │   ├── page.tsx                  # Account type selection (step 1)
│   │   └── setup/page.tsx            # Account setup form (step 2)
│   ├── tools/
│   │   ├── calculator/page.tsx       # Pip/Margin/P&L calculator
│   │   ├── converter/page.tsx        # Currency converter
│   │   └── tick-history/page.tsx     # Tick data viewer
│   └── api/                          # Next.js API Routes (BFF layer)
│       ├── auth/
│       │   ├── login/route.ts        # POST login
│       │   ├── logout/route.ts       # POST logout
│       │   ├── me/route.ts           # GET current user
│       │   └── register/route.ts     # POST register
│       ├── dashboard/
│       │   └── snapshot/route.ts     # GET public snapshot
│       ├── test-db/route.ts          # GET database test
│       ├── trading/                  # WebTrader API stubs (NOT_IMPLEMENTED)
│       │   ├── account/route.ts
│       │   ├── auth/route.ts
│       │   ├── history/route.ts
│       │   ├── orders/route.ts
│       │   ├── positions/route.ts
│       │   └── symbols/route.ts
│       └── private/                  # Authenticated API routes
│           ├── accounts/
│           │   ├── route.ts          # GET/POST accounts
│           │   ├── sync-all-balances/route.ts
│           │   └── [accountId]/
│           │       ├── route.ts      # DELETE account
│           │       ├── status/route.ts
│           │       ├── password/route.ts
│           │       ├── sync-balance/route.ts
│           │       └── credentials/verify/route.ts
│           ├── dashboard/
│           │   ├── snapshot/route.ts
│           │   └── positions/sync/route.ts
│           ├── wallet/
│           │   ├── funds/route.ts
│           │   ├── transactions/route.ts
│           │   └── transfer/route.ts
│           ├── journal/
│           │   ├── stats/route.ts
│           │   ├── equity-curve/route.ts
│           │   ├── monte-carlo/route.ts
│           │   ├── patterns/route.ts
│           │   ├── projections/route.ts
│           │   ├── reports/route.ts
│           │   └── notes/
│           │       ├── route.ts
│           │       └── [id]/route.ts
│           ├── mm/
│           │   ├── accounts/route.ts
│           │   ├── transactions/route.ts
│           │   └── transfers/route.ts
│           ├── copy-trading/route.ts
│           ├── notifications/route.ts
│           ├── partner/route.ts
│           ├── profile/route.ts
│           ├── referrals/route.ts
│           ├── rewards/route.ts
│           ├── settings/route.ts
│           ├── social/strategies/route.ts
│           ├── support/tickets/
│           │   ├── route.ts
│           │   └── [id]/route.ts
│           └── trading/
│               ├── history/route.ts
│               └── performance/route.ts
├── components/                       # Shared React components
│   ├── auth/
│   │   ├── auth-provider.tsx         # AuthContext provider with login/logout/refresh
│   │   ├── login-page-client.tsx     # Login form component
│   │   └── register-page-client.tsx  # Registration form component
│   ├── layout/
│   │   ├── DashboardLayout.tsx       # Simple dashboard wrapper
│   │   ├── global-layout-wrapper.tsx # Controls sidebar/navbar visibility per route
│   │   ├── Navbar.tsx                # Top navigation bar
│   │   └── Sidebar.tsx              # Side navigation with grouped menu items
│   ├── dashboard/
│   │   ├── dashboard-data-provider.tsx # Dashboard data context with WebSocket
│   │   ├── dashboard-shell.tsx       # Dashboard container with edit mode & marketplace
│   │   ├── notifications-dropdown.tsx# Notification panel
│   │   ├── profile-dropdown.tsx      # Profile menu dropdown
│   │   ├── widget-grid.tsx           # Draggable widget grid (react-grid-layout)
│   │   ├── widget-marketplace.tsx    # Widget toggle marketplace
│   │   └── widgets/
│   │       ├── account-overview-widget.tsx
│   │       ├── active-positions-widget.tsx
│   │       ├── card-color-game.tsx
│   │       ├── crash-game.tsx
│   │       ├── deposit-withdrawal-widget.tsx
│   │       ├── entertainment-widget.tsx
│   │       ├── fund-action-form.tsx
│   │       ├── market-gauge.tsx
│   │       ├── market-overview-settings-modal.tsx
│   │       ├── market-overview-widget.tsx
│   │       ├── recent-trades-widget.tsx
│   │       ├── roulette-game.tsx
│   │       ├── trading-performance-settings-modal.tsx
│   │       ├── trading-sessions-widget.tsx
│   │       ├── trading-statistics-widget.tsx
│   │       ├── transaction-details-modal.tsx
│   │       └── transfer-modal.tsx
│   ├── accounts/
│   │   ├── accounts-page.tsx         # Trading accounts list & management
│   │   ├── account-credentials-modal.tsx
│   │   ├── account-preview-modal.tsx
│   │   ├── change-password-modal.tsx
│   │   └── create-account-modal.tsx
│   ├── wallet/
│   │   ├── wallet-page.tsx           # Main wallet UI
│   │   ├── crypto-deposit-dashboard.tsx
│   │   ├── transaction-history-page.tsx
│   │   └── wallet-footer.tsx         # Legal footer
│   ├── analytics/
│   │   ├── analyst-views-dashboard.tsx
│   │   ├── economic-calendar-dashboard.tsx
│   │   └── market-news-dashboard.tsx
│   ├── copy-trading/
│   │   ├── copy-trading-dashboard.tsx
│   │   ├── discover-strategies.tsx
│   │   └── my-strategies-content.tsx
│   ├── journal/
│   │   ├── journal-dashboard.tsx
│   │   ├── journal-stats.tsx
│   │   └── equity-curve-chart.tsx
│   ├── money-management/
│   │   ├── money-management-dashboard.tsx
│   │   ├── create-fund-form.tsx
│   │   ├── fund-card.tsx
│   │   └── fund-details-dialog.tsx
│   ├── settings/
│   │   ├── settings-profile-dashboard.tsx
│   │   ├── settings-security-dashboard.tsx
│   │   └── settings-trading-terminal-dashboard.tsx
│   ├── social/
│   │   ├── social-trading-dashboard.tsx
│   │   ├── discover-traders.tsx
│   │   ├── my-social-accounts.tsx
│   │   ├── my-subscriptions.tsx
│   │   ├── strategy-card.tsx
│   │   ├── strategy-details-modal.tsx
│   │   └── full-analysis-modal.tsx
│   ├── support/
│   │   ├── support-dashboard.tsx
│   │   └── open-ticket-dashboard.tsx
│   ├── trading/
│   │   ├── history-dashboard.tsx
│   │   └── performance-dashboard.tsx
│   ├── webtrader/
│   │   ├── webtrader-layout.tsx      # Full trading terminal layout
│   │   ├── chart/tradingview-chart.tsx
│   │   ├── dashboard/account-info-bar.tsx
│   │   ├── login/trading-login-form.tsx
│   │   ├── market-watch/market-watch-panel.tsx
│   │   ├── orders/pending-orders-table.tsx
│   │   ├── positions/positions-table.tsx
│   │   └── trading/trading-panel.tsx
│   ├── branding/brand-badge.tsx      # Logo component
│   ├── icons/crypto-icons.tsx        # Crypto SVG icons
│   ├── theme-provider.tsx            # next-themes wrapper
│   └── ui/                           # ShadCN-style primitives
│       ├── alert.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── page-loader.tsx
│       ├── resizable.tsx
│       ├── scroll-area.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── skeleton.tsx
│       ├── switch.tsx
│       ├── table.tsx
│       ├── tabs.tsx
│       └── toast-container.tsx
├── store/                            # Zustand state stores
│   ├── dashboard-layout-store.ts     # Widget grid layout & edit mode
│   ├── notification-store.ts         # Notifications state
│   ├── roulette-store.ts             # Roulette game points
│   ├── toast-store.ts                # Toast notifications
│   ├── trading-store.ts              # Wallets, accounts, positions, transactions
│   └── webtrader-store.ts            # WebTrader session & trading state
├── lib/                              # Business logic & utilities
│   ├── utils.ts                      # cn(), formatCurrency(), formatTimeLabel()
│   ├── mock-data.ts                  # Mock strategies, widgets, instruments
│   ├── auth/
│   │   ├── constants.ts              # Session cookie name, TTL
│   │   └── types.ts                  # AuthUser interface
│   ├── dashboard/
│   │   ├── api-provider.ts           # API data provider with retry
│   │   ├── default-state.ts          # Empty dashboard snapshot
│   │   ├── mock-provider.ts          # Mock data provider
│   │   ├── provider.ts              # DashboardDataProvider interface
│   │   ├── provider-factory.ts       # Factory (api vs mock)
│   │   └── widget-catalog.ts         # Widget metadata & default layouts
│   ├── server/                       # Server-only modules (BFF)
│   │   ├── auth.ts                   # Session management, cookie ops
│   │   ├── backend-env.ts            # Env variable resolution
│   │   ├── database.ts              # In-memory DB + backend integration
│   │   ├── dashboard-service.ts      # Trading business logic
│   │   ├── accounts-backend.ts       # HTTP client for accounts backend
│   │   ├── wallet-backend.ts         # HTTP client for wallet backend
│   │   ├── mt5-manager.ts           # MT5 provisioning via PowerShell
│   │   ├── password.ts              # scrypt hashing
│   │   └── snapshot-format.ts        # Transaction normalization
│   └── trading/
│       ├── api-client.ts             # WebTrader REST client
│       ├── constants.ts              # WS config, endpoints, servers
│       └── websocket-client.ts       # Socket.io trading client
├── types/                            # TypeScript type definitions
│   ├── dashboard.ts                  # Dashboard domain types
│   └── webtrader.ts                  # WebTrader domain types
├── middleware.ts                     # Next.js auth middleware
├── next.config.mjs                   # Next.js configuration
├── tailwind.config.ts                # Tailwind CSS configuration
├── tsconfig.json                     # TypeScript configuration
├── postcss.config.mjs                # PostCSS configuration
├── .eslintrc.json                    # ESLint configuration
└── public/
    ├── favicon.ico
    ├── vite.svg
    ├── swagger.html
    └── assets/
        ├── logo.png
        └── logo_white.png
```

### Architectural Pattern

**Feature-based + BFF (Backend-for-Frontend)** architecture:
- Pages are organized by feature domain (`wallet/`, `trading/`, `analytics/`, etc.)
- Components mirror page structure with dedicated feature folders
- Next.js API routes act as a BFF layer, proxying requests to backend microservices
- State is managed globally via Zustand stores, one per domain
- UI primitives follow the ShadCN pattern (Radix UI + Tailwind + CVA)

### Entry Point & Bootstrap Flow

1. `app/layout.tsx` — Root layout loads Inter font, wraps app with:
   - `ThemeProvider` (next-themes, dark mode default)
   - `AuthProvider` (React Context for auth state)
   - `GlobalLayoutWrapper` (conditionally renders Sidebar + Navbar)
   - `PageLoader` (route transition progress bar)
   - `ToastContainer` (global toast notifications)
2. `middleware.ts` — Intercepts requests, validates session cookie, protects `/api/private/*` routes
3. `app/page.tsx` — Home page redirects authenticated users to `/dashboard`

---

## SECTION 3: Routing & Navigation (Complete Route Map)

| Route Path | Page/Component | Auth Required | Role Required | Lazy Loaded | Description |
|---|---|---|---|---|---|
| `/` | `app/page.tsx` | Yes (redirects) | — | No | Home page, redirects to /dashboard |
| `/login` | `LoginPageClient` | No | — | No | User login with email/password |
| `/register` | `RegisterPageClient` | No | — | No | User registration |
| `/dashboard` | `DashboardShell` | Yes | — | No | Main dashboard with configurable widget grid |
| `/dashboard/profile` | Profile page | Yes | — | No | User profile overview |
| `/accounts` | `AccountsPage` | Yes | — | No | Trading accounts management (create, archive, delete) |
| `/account-settings` | Account Settings | Yes | — | No | Individual account settings (leverage, rename, statements) |
| `/open-account` | Open Account wizard | Yes | — | No | Step 1: Select account type (Standard/Professional) |
| `/open-account/setup` | Account Setup form | Yes | — | No | Step 2: Configure account (currency, leverage, platform, password) |
| `/wallet` | `WalletPage` | Yes | — | No | Main wallet with balances, deposit/withdraw forms |
| `/wallet/deposits` | Deposits page | Yes | — | No | Deposit funds view |
| `/wallet/withdrawals` | Withdrawals page | Yes | — | No | Withdrawal funds view |
| `/wallet/transfers` | Transfers page | Yes | — | No | Internal transfers view |
| `/wallet/history` | `TransactionHistoryPage` | Yes | — | No | Full transaction history with filters |
| `/wallet/crypto` | Crypto Wallet | Yes | — | No | Crypto wallet overview |
| `/wallet/crypto/deposit` | `CryptoDepositDashboard` | Yes | — | No | Bitcoin deposit flow with address |
| `/trading/history` | `HistoryDashboard` | Yes | — | No | Trade history with filtering |
| `/trading/performance` | `PerformanceDashboard` | Yes | — | No | Trading performance analytics with charts |
| `/analytics/market-news` | `MarketNewsDashboard` | Yes | — | No | Financial news feed |
| `/analytics/economic-calendar` | `EconomicCalendarDashboard` | Yes | — | No | Economic events calendar |
| `/analytics/trading-signals` | Trading Signals | Yes | — | No | Professional trading signals |
| `/analytics/analyst-views` | `AnalystViewsDashboard` | Yes | — | No | Technical analysis from Trading Central |
| `/markets` | Markets Overview | Yes | — | No | All markets summary |
| `/markets/forex` | Forex page | Yes | — | No | Forex pairs listing with spreads/leverage |
| `/markets/crypto` | Crypto page | Yes | — | No | Crypto assets listing |
| `/markets/commodities` | Commodities page | Yes | — | No | Commodities listing |
| `/markets/indices` | Indices page | Yes | — | No | Indices listing |
| `/markets/stocks` | Stocks page | Yes | — | No | Stocks CFD listing |
| `/copy-trading` | `CopyTradingDashboard` | Yes | — | No | Discover and copy trading strategies |
| `/social` | `SocialTradingDashboard` | Yes | — | Yes (`dynamic`) | Social trading with strategy subscriptions |
| `/journal` | `JournalDashboard` | Yes | — | Yes (`dynamic`) | Trading journal with stats and equity curve |
| `/money-management` | `MoneyManagementDashboard` | Yes | — | No | PAMM fund management |
| `/support` | `SupportHubDashboard` | Yes | — | No | Support center with FAQ, contact, live chat |
| `/support/open-ticket` | `OpenTicketDashboard` | Yes | — | No | Multi-step ticket creation form |
| `/settings/profile` | `SettingsProfileDashboard` | Yes | — | No | Profile settings & verification |
| `/settings/security` | `SettingsSecurityDashboard` | Yes | — | No | Password, 2FA, device management |
| `/settings/trading-terminal` | `SettingsTradingTerminalDashboard` | Yes | — | No | Default terminal preferences |
| `/webtrader` | `WebtraderLayout` | No* | — | No | Full MT5 web trading terminal |
| `/webtrader/login` | `TradingLoginForm` | No | — | No | MT5 account login |
| `/notifications` | Notifications center | Yes | — | No | All notifications with read/unread |
| `/rewards` | Rewards page | Yes | — | No | Loyalty tiers (Bronze/Silver/Gold/Platinum) |
| `/invite-friends` | Invite Friends | Yes | — | No | Referral program with tracking |
| `/partner-dashboard` | Partner Dashboard | Yes | — | No | IB commission stats & recent payouts |
| `/platforms` | Platforms page | Yes | — | No | MT5/WebTrader download links |
| `/premium` | Premium page | Yes | — | No | Premium tier requirements & perks |
| `/vps` | VPS page | Yes | — | No | VPS hosting plans (Basic/Standard/Pro) |
| `/education` | Education page | Yes | — | No | FxTrusts Academy with 6 courses |
| `/conditions` | Conditions page | Yes | — | No | Trading conditions, spreads, fees |
| `/conversion-rates` | Conversion Rates | Yes | — | No | Live currency conversion rates |
| `/tools/calculator` | Calculator page | Yes | — | No | Pip, Margin, P&L calculators |
| `/tools/converter` | Converter page | Yes | — | No | Currency converter tool |
| `/tools/tick-history` | Tick History | Yes | — | No | Historical tick data viewer |

*WebTrader has its own auth flow (MT5 credentials), separate from the main CRM auth.

### Route Guard / Protected Route Implementation

**Middleware-based protection** (`middleware.ts`):

```typescript
// Public paths that skip authentication
const publicPaths = ["/login", "/register", "/forgot-password",
  "/api/auth/login", "/api/auth/register", "/api/auth/logout",
  "/api/dashboard/snapshot", "/api/test-db"];

// Middleware checks for session cookie 'dm_session'
// - /api/private/* routes → returns 401 JSON if no session
// - All other protected routes → redirects to /login
```

**Redirect Logic:**
- Unauthenticated users accessing protected routes → redirected to `/login`
- `/login` and `/register` are always accessible
- `/api/private/*` endpoints return `401 Unauthorized` JSON without redirect
- WebTrader (`/webtrader/*`) has its own layout and does not use the CRM middleware

### 404/Not Found Handling

Uses Next.js default 404 handling — no custom `not-found.tsx` is defined.

### Nested Routes & Layout System

- `app/layout.tsx` — Global root layout (theme, auth, sidebar/navbar)
- `app/dashboard/layout.tsx` — Dashboard layout wrapper
- `app/analytics/layout.tsx` — Analytics layout wrapper
- `app/settings/layout.tsx` — Settings layout wrapper (DashboardLayout)
- `app/support/layout.tsx` — Support layout wrapper (DashboardLayout)
- `app/webtrader/layout.tsx` — Standalone WebTrader layout (no sidebar/navbar)

`GlobalLayoutWrapper` conditionally hides the Sidebar and Navbar on public routes (`/login`, `/register`, `/forgot-password`, `/webtrader`).

---

## SECTION 4: Page-by-Page Documentation (EVERY PAGE)

---

### Login Page — `app/login/page.tsx`
**Route:** `/login`
**Purpose:** User authentication with email and password

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/auth/login | POST | On form submit | `{email, password}` | Sets session cookie, returns user object | `AuthProvider.login()` |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| LoginPageClient | Login form with validation | — |
| BrandBadge | Logo display | `size="lg"` |

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| email | string | local | Email input value |
| password | string | local | Password input value |
| error | string | API error | Displays login error message |
| loading | boolean | local | Shows loading spinner on button |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| Email input | Type | Updates email state |
| Password input | Type | Updates password state |
| "Sign In" button | Click/Submit | Calls POST /api/auth/login, redirects to /dashboard on success |
| "Register" link | Click | Navigates to /register |

**Conditional Rendering:**
- Shows error message if login fails
- Button shows spinner while loading

---

### Register Page — `app/register/page.tsx`
**Route:** `/register`
**Purpose:** New user registration

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/auth/register | POST | On form submit | `{name, email, phone, country, password}` | Auto-logs in user on success | `AuthProvider.login()` (after register) |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| RegisterPageClient | Registration form | — |
| BrandBadge | Logo display | `size="lg"` |

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| name | string | local | Full name input |
| email | string | local | Email input |
| phone | string | local | Phone number input |
| country | string | local | Country selection |
| password | string | local | Password input |
| agreed | boolean | local | Terms acceptance checkbox |
| error | string | API error | Registration error message |
| loading | boolean | local | Shows loading state |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| Form fields | Type | Updates respective state |
| Terms checkbox | Toggle | Enables/disables submit button |
| "Create Account" button | Submit | Calls POST /api/auth/register, then auto-login |
| "Sign In" link | Click | Navigates to /login |

**Conditional Rendering:**
- Submit button disabled until terms accepted
- Error banner shown on failure

---

### Dashboard Page — `app/dashboard/page.tsx`
**Route:** `/dashboard`
**Purpose:** Main dashboard with configurable, draggable widget grid

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/dashboard/snapshot | GET | On page mount | — | accounts, positions, wallets, transactions, market data | `DashboardDataProvider.fetch()` |
| /api/private/dashboard/positions/sync | POST | On sync button click | — | Live positions from broker | via `DashboardDataProvider` |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| DashboardShell | Main container with tabs, edit mode, marketplace | — |
| DashboardDataProvider | Context provider for dashboard data | `children` |
| WidgetGrid | Draggable/resizable widget layout | `editMode`, `snapshot` |
| WidgetMarketplace | Toggle widgets on/off | `open`, `onClose` |
| AccountOverviewWidget | Shows trading accounts | — |
| ActivePositionsWidget | Lists open positions | — |
| DepositWithdrawalWidget | Deposit/withdraw forms | — |
| MarketOverviewWidget | Market instruments & sentiment | — |
| RecentTradesWidget | Trade history | — |
| TradingSessionsWidget | World map with session times | — |
| TradingStatisticsWidget | Performance metrics | — |
| EntertainmentWidget | Mini-games (Roulette, Cards, Crash) | — |

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| snapshot | DashboardSnapshot | API/Context | All dashboard data |
| isLoading | boolean | Context | Shows loading state |
| editMode | boolean | dashboard-layout-store | Enables widget dragging |
| showMarketplace | boolean | local | Shows widget marketplace |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| "Edit" button | Click | Enables drag-and-drop widget repositioning |
| "Save" button | Click | Persists widget layout to localStorage |
| "Cancel" button | Click | Reverts unsaved layout changes |
| "Add Widgets" button | Click | Opens widget marketplace modal |
| Widget drag handle | Drag | Repositions widget in grid |
| Widget resize handle | Drag | Resizes widget |

**Conditional Rendering:**
- Shows welcome message with user name
- Shows loading skeleton while data fetches
- Shows error state with retry button on failure
- Widgets only render if enabled in layout store

---

### Accounts Page — `app/accounts/page.tsx`
**Route:** `/accounts`
**Purpose:** Manage trading accounts (MT5/cTrader) — create, view, archive, delete

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/accounts | GET | On mount | — | Array of trading accounts | `tradingStore.hydrateFromSnapshot()` |
| /api/private/accounts | POST | On create account | `{platform, mode, currency, leverage, group, nickname, password}` | New account object | `tradingStore.createAccount()` |
| /api/private/accounts/[id]/status | PATCH | On archive/activate | `{status}` | Updated account | `tradingStore.archiveAccount()` |
| /api/private/accounts/[id] | DELETE | On delete | — | — | `tradingStore.deleteAccount()` |
| /api/private/accounts/sync-all-balances | POST | On sync button | — | Updated balances | `tradingStore.syncAllBalances()` |
| /api/private/accounts/[id]/sync-balance | POST | Per account sync | — | Updated balance | `tradingStore.syncAccountBalance()` |
| /api/private/accounts/[id]/credentials/verify | POST | On verify click | `{login, password}` | Verification result | Direct fetch |
| /api/private/accounts/[id]/password | POST | On password change | `{newPassword, type}` | — | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| AccountsPage | Main accounts list and management | — |
| CreateAccountModal | Account creation form | `open`, `onClose` |
| AccountCredentialsModal | Shows login/password | `account`, `open`, `onClose` |
| AccountPreviewModal | Account analytics | `account`, `open`, `onClose` |
| ChangePasswordModal | Password change flow | `account`, `open`, `onClose` |

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| accounts | TradingAccount[] | trading-store | All user trading accounts |
| filter | "all" \| "live" \| "demo" | local | Account type filter |
| selectedAccount | TradingAccount \| null | local | Currently selected account for modals |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| "New Account" button | Click | Opens CreateAccountModal |
| Filter tabs | Click | Filters accounts by Live/Demo/All |
| Account row "Preview" | Click | Opens AccountPreviewModal with analytics |
| Account row "Credentials" | Click | Opens AccountCredentialsModal |
| Account row "Archive" | Click | Calls PATCH status to Archived |
| Account row "Delete" | Click | Shows confirmation, then calls DELETE |
| "Sync Balances" button | Click | Syncs all account balances from broker |

---

### Wallet Page — `app/wallet/page.tsx`
**Route:** `/wallet`
**Purpose:** Manage wallet balances, deposits, withdrawals

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/dashboard/snapshot | GET | On mount | — | Wallet balances, transactions | `tradingStore.hydrateFromSnapshot()` |
| /api/private/wallet/funds | POST | On deposit/withdraw | `{type, currency, amount, method}` | Updated balance | `tradingStore.submitFunds()` |
| /api/private/wallet/transactions | GET | On mount | — | Transaction history | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| WalletPage | Main wallet interface | — |
| FundActionForm | Deposit/withdraw form | `type`, `onSubmit` |
| TransactionDetailsModal | Transaction detail view | `transaction`, `open`, `onClose` |

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| wallets | Wallet[] | trading-store | USD/EUR wallet balances |
| transactions | Transaction[] | trading-store | Transaction history |
| activeTab | string | local | Deposit/Withdraw tab |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| Deposit tab | Click | Shows deposit form |
| Withdraw tab | Click | Shows withdrawal form |
| Amount input | Type | Updates amount value |
| Currency selector | Select | Switches USD/EUR wallet |
| Payment method | Select | Selects payment provider |
| Submit form | Click | Calls POST /api/private/wallet/funds |
| Transaction row | Click | Opens TransactionDetailsModal |

---

### Wallet History Page — `app/wallet/history/page.tsx`
**Route:** `/wallet/history`
**Purpose:** Complete transaction history with advanced filtering

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/wallet/transactions | GET | On mount | — | Full transaction list | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| TransactionHistoryPage | Filterable transaction table | — |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| Date filter | Select | Filters transactions by date range |
| Type filter | Select | Filters by Deposit/Withdrawal/Transfer |
| Status filter | Select | Filters by Completed/Pending/Failed |
| Export button | Click | Downloads transaction data |

---

### Wallet Transfers Page — `app/wallet/transfers/page.tsx`
**Route:** `/wallet/transfers`
**Purpose:** Transfer funds between wallet and trading accounts

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/wallet/transfer | POST | On form submit | `{from, to, amount, currency}` | Updated balances | `tradingStore.transferFunds()` |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| TransferModal | Transfer form with direction toggle | `open`, `onClose` |

---

### Crypto Deposit Page — `app/wallet/crypto/deposit/page.tsx`
**Route:** `/wallet/crypto/deposit`
**Purpose:** Deposit Bitcoin to wallet

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| CryptoDepositDashboard | Bitcoin deposit with address display | — |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| Amount input | Type | Sets deposit amount |
| Copy address | Click | Copies Bitcoin address to clipboard |
| Confirm deposit | Click | Shows success confirmation |

---

### Trading History Page — `app/trading/history/page.tsx`
**Route:** `/trading/history`
**Purpose:** View complete trade history with filtering

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/trading/history | GET | On mount | `?account=&period=` | Trade history array | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| HistoryDashboard | Trade list with filters | — |

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| trades | Trade[] | API | Trade history data |
| accountFilter | string | local | Filter by account |
| periodFilter | string | local | Filter by time period |

---

### Trading Performance Page — `app/trading/performance/page.tsx`
**Route:** `/trading/performance`
**Purpose:** Trading performance analytics with charts

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/trading/performance | GET | On mount | `?account=&period=` | Performance metrics | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| PerformanceDashboard | Charts and metrics | — |

---

### Analytics: Market News — `app/analytics/market-news/page.tsx`
**Route:** `/analytics/market-news`
**Purpose:** Financial news feed with category filtering

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| MarketNewsDashboard | News cards with tags | — |

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| news | NewsItem[] | Mock data | News articles |
| category | string | local | Category filter |
| search | string | local | Search query |

---

### Analytics: Economic Calendar — `app/analytics/economic-calendar/page.tsx`
**Route:** `/analytics/economic-calendar`
**Purpose:** Live economic events calendar with impact indicators

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| EconomicCalendarDashboard | Events table with filters | — |

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| events | EconomicEvent[] | Mock data | Calendar events |
| filter | string | local | Impact/country filter |
| expandedEvent | string \| null | local | Currently expanded event |

---

### Analytics: Trading Signals — `app/analytics/trading-signals/page.tsx`
**Route:** `/analytics/trading-signals`
**Purpose:** Professional trading signals display

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| signals | Signal[] | Mock data | Signal list with entry/exit/SL/TP |
| filter | string | local | Category filter |

---

### Analytics: Analyst Views — `app/analytics/analyst-views/page.tsx`
**Route:** `/analytics/analyst-views`
**Purpose:** Technical analysis from Trading Central with tabbed categories

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| AnalystViewsDashboard | Tabbed analysis cards | — |

---

### Markets Overview — `app/markets/page.tsx`
**Route:** `/markets`
**Purpose:** All tradeable markets with navigation to category pages

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| Category card | Click | Navigates to specific market page (forex, crypto, etc.) |

---

### Markets: Forex — `app/markets/forex/page.tsx`
**Route:** `/markets/forex`
**Purpose:** Lists forex pairs with spread, leverage, and session info

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| instruments | Instrument[] | Hardcoded | 12 forex pairs with details |
| stats | Stat[] | Hardcoded | Summary stats (200+ pairs, 0.0 spread, etc.) |

---

### Markets: Crypto — `app/markets/crypto/page.tsx`
**Route:** `/markets/crypto`
**Purpose:** Cryptocurrency CFD listing

---

### Markets: Commodities — `app/markets/commodities/page.tsx`
**Route:** `/markets/commodities`
**Purpose:** Commodities listing with categories (Metals, Energy, Agriculture)

---

### Markets: Indices — `app/markets/indices/page.tsx`
**Route:** `/markets/indices`
**Purpose:** Global stock indices listing

---

### Markets: Stocks — `app/markets/stocks/page.tsx`
**Route:** `/markets/stocks`
**Purpose:** Stock CFDs with sector classification

---

### Copy Trading — `app/copy-trading/page.tsx`
**Route:** `/copy-trading`
**Purpose:** Discover, favorite, and copy trading strategies

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/copy-trading | GET | On mount | — | Strategy list | Direct fetch |
| /api/private/copy-trading | POST | On copy/follow | `{strategyId, action}` | — | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| CopyTradingDashboard | Tabbed interface | — |
| DiscoverStrategies | Strategy list with filters | — |
| MyStrategiesContent | Top earners, referral, FAQ | — |

---

### Social Trading — `app/social/page.tsx`
**Route:** `/social`
**Purpose:** Social trading with strategy discovery, subscriptions, and accounts

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/social/strategies | GET | On mount | — | Strategies list | Direct fetch |

**Components Used (all lazy loaded):**
| Component | Purpose | Props Passed |
|---|---|---|
| SocialTradingDashboard | Tabbed dashboard | — |
| DiscoverTraders | Trader search and filter | — |
| MySocialAccounts | Master/slave accounts | — |
| MySubscriptions | Active subscriptions | — |
| StrategyCard | Strategy display card | `strategy` |
| StrategyDetailsModal | Full strategy details | `strategy`, `open`, `onClose` |
| FullAnalysisModal | Comprehensive analysis | `strategy`, `open`, `onClose` |

---

### Trading Journal — `app/journal/page.tsx`
**Route:** `/journal`
**Purpose:** Trading journal with statistics, equity curve, notes, Monte Carlo analysis

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/journal/stats | GET | On mount | — | Journal statistics | Direct fetch |
| /api/private/journal/equity-curve | GET | On mount | — | Equity curve data points | Direct fetch |
| /api/private/journal/notes | GET | On mount | — | Journal notes list | Direct fetch |
| /api/private/journal/notes | POST | On note creation | `{title, content, tags}` | New note | Direct fetch |
| /api/private/journal/notes/[id] | DELETE | On note delete | — | — | Direct fetch |
| /api/private/journal/monte-carlo | POST | On analysis request | `{trades, simulations}` | Monte Carlo results | Direct fetch |
| /api/private/journal/patterns | GET | On tab switch | — | Trading patterns | Direct fetch |
| /api/private/journal/projections | GET | On tab switch | — | Growth projections | Direct fetch |
| /api/private/journal/reports | POST | On report generate | `{type, period}` | Report data | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| JournalDashboard | Main journal interface | — |
| JournalStats | Statistics cards | `stats` |
| EquityCurveChart | Equity line chart | `data` |

---

### Money Management — `app/money-management/page.tsx`
**Route:** `/money-management`
**Purpose:** PAMM fund discovery and investment management

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/mm/accounts | GET | On mount | — | PAMM accounts list | Direct fetch |
| /api/private/mm/transactions | GET | On tab switch | — | PAMM transaction history | Direct fetch |
| /api/private/mm/transfers | POST | On investment | `{fundId, amount, idempotencyKey}` | Transfer result | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| MoneyManagementDashboard | Fund listing with filters | — |
| FundCard | Individual fund display | `fund` |
| FundDetailsDialog | Full fund details modal | `fund`, `open`, `onClose` |
| CreateFundForm | Fund creation form | — |

---

### Support Hub — `app/support/page.tsx`
**Route:** `/support`
**Purpose:** Support center with FAQ, contact options, and ticket tracking

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/support/tickets | GET | On mount | — | User's support tickets | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| SupportHubDashboard | FAQ, contact cards, ticket list | — |

---

### Open Support Ticket — `app/support/open-ticket/page.tsx`
**Route:** `/support/open-ticket`
**Purpose:** Multi-step support ticket creation

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/support/tickets | POST | On form submit | `{category, subject, description, priority}` | Ticket ID | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| OpenTicketDashboard | Stepped ticket form | — |

---

### Settings: Profile — `app/settings/profile/page.tsx`
**Route:** `/settings/profile`
**Purpose:** Account overview, verification steps, profile management

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/profile | GET | On mount | — | Profile data | Direct fetch |
| /api/private/profile | PATCH | On update | `{name, phone, country}` | Updated profile | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| SettingsProfileDashboard | Verification steps and profile form | — |

---

### Settings: Security — `app/settings/security/page.tsx`
**Route:** `/settings/security`
**Purpose:** Password management, 2FA, device security

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/settings | GET | On mount | — | Security settings | Direct fetch |
| /api/private/settings | PUT | On save | `{setting, value}` | Updated settings | Direct fetch |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| SettingsSecurityDashboard | Security settings interface | — |

---

### Settings: Trading Terminal — `app/settings/trading-terminal/page.tsx`
**Route:** `/settings/trading-terminal`
**Purpose:** Set default trading terminal for MT4/MT5 accounts

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| SettingsTradingTerminalDashboard | Terminal preference form | — |

---

### WebTrader — `app/webtrader/page.tsx`
**Route:** `/webtrader`
**Purpose:** Full MT5 web-based trading terminal

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/trading/auth | POST | On MT5 login | `{login, password, server}` | Session token | `tradingApiClient.auth()` |
| /api/trading/account | GET | After auth | — | Account info | `tradingApiClient.getAccount()` |
| /api/trading/symbols | GET | After auth | — | Symbol list | `tradingApiClient.getSymbols()` |
| /api/trading/positions | GET | Periodic | — | Open positions | `tradingApiClient.getPositions()` |
| /api/trading/orders | GET/POST/PATCH/DELETE | On trade | Trade request | Trade result | `tradingApiClient.*` |
| /api/trading/history | GET | On tab switch | `?from=&to=` | Deal history | `tradingApiClient.getHistory()` |
| WebSocket | — | Persistent | — | Real-time prices | `WebSocketClient` |

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| WebtraderLayout | Main terminal layout with resizable panels | — |
| TradingViewChart | Price chart with controls | — |
| MarketWatchPanel | Symbol list with live prices | — |
| TradingPanel | Order entry form | — |
| PositionsTable | Open positions display | — |
| PendingOrdersTable | Pending orders display | — |
| AccountInfoBar | Account balance/equity/margin | — |

**State Variables (webtrader-store):**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| isConnected | boolean | WebSocket | Connection status |
| session | TradingSession \| null | API | MT5 session |
| symbols | SymbolInfo[] | API | Available instruments |
| positions | Position[] | API/WS | Open positions |
| orders | Order[] | API/WS | Pending orders |
| accountInfo | TradingAccountInfo \| null | API | Balance, equity, margin |
| selectedSymbol | string | local | Currently selected symbol |
| chartTimeframe | string | local | Chart timeframe |

---

### WebTrader Login — `app/webtrader/login/page.tsx`
**Route:** `/webtrader/login`
**Purpose:** MT5 account authentication

**Components Used:**
| Component | Purpose | Props Passed |
|---|---|---|
| TradingLoginForm | MT5 login with server selector | — |
| BrandBadge | Logo | `size="sm"` |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| Login input | Type | MT5 account number |
| Password input | Type | MT5 password |
| Server dropdown | Select | Picks MT5 server |
| "Connect" button | Submit | Authenticates with MT5 server |
| "Back to Dashboard" link | Click | Navigates to / |

---

### Notifications — `app/notifications/page.tsx`
**Route:** `/notifications`
**Purpose:** View all notifications with read/unread status

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/notifications | GET | On mount | — | Notifications list | `notificationStore.fetchNotifications()` |
| /api/private/notifications | PUT | On mark read | `{id}` or `{all: true}` | — | `notificationStore.markAsRead()` |

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| notifications | Notification[] | notification-store | All notifications |
| unreadCount | number | Computed | Count of unread notifications |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| "Mark all as read" button | Click | Marks all notifications as read |
| Notification row | Visual | Unread items highlighted with primary color |

---

### Rewards — `app/rewards/page.tsx`
**Route:** `/rewards`
**Purpose:** Loyalty program with tier system (Bronze, Silver, Gold, Platinum)

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/rewards | GET | On mount | — | Tier info, available rewards | Direct fetch |
| /api/private/rewards | POST | On claim | `{rewardId}` | Claim result | Direct fetch |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| "Claim" button | Click | Claims a reward |
| Tier progress bar | Visual | Shows progress to next tier |

---

### Invite Friends — `app/invite-friends/page.tsx`
**Route:** `/invite-friends`
**Purpose:** Referral program with tracking and earnings

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/referrals | GET | On mount | — | Referral stats, referral list | Direct fetch |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| Copy referral link | Click | Copies link to clipboard |
| Referral history table | View | Shows referred users and status |

---

### Partner Dashboard — `app/partner-dashboard/page.tsx`
**Route:** `/partner-dashboard`
**Purpose:** IB (Introducing Broker) commission stats and recent payouts

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/partner?type=stats | GET | On mount | — | Commission totals, partner level | Direct fetch |
| /api/private/partner?type=commissions | GET | On mount | — | Commission history | Direct fetch |

---

### Platforms — `app/platforms/page.tsx`
**Route:** `/platforms`
**Purpose:** Download MetaTrader 5 and access WebTrader

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| MT5 "Download" button | Click | Opens external MQL5 download link |
| WebTrader "Launch" button | Click | Navigates to /webtrader |

---

### Premium — `app/premium/page.tsx`
**Route:** `/premium`
**Purpose:** Premium account tiers with requirements and perks

---

### VPS — `app/vps/page.tsx`
**Route:** `/vps`
**Purpose:** Free VPS hosting plans (Basic, Standard, Pro) with deposit requirements

---

### Education — `app/education/page.tsx`
**Route:** `/education`
**Purpose:** FxTrusts Academy with 6 courses, 77 lessons

---

### Conditions — `app/conditions/page.tsx`
**Route:** `/conditions`
**Purpose:** Trading conditions — account types, spreads, fees, deposit/withdrawal methods

---

### Conversion Rates — `app/conversion-rates/page.tsx`
**Route:** `/conversion-rates`
**Purpose:** Live currency conversion rates for 15 pairs

---

### Open Account (Step 1) — `app/open-account/page.tsx`
**Route:** `/open-account`
**Purpose:** Select account type — Standard (2 types) or Professional (4 types)

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| Account type card | Click | Selects account plan |
| "Continue" button | Click | Navigates to /open-account/setup with selected plan |

---

### Open Account (Step 2) — `app/open-account/setup/page.tsx`
**Route:** `/open-account/setup`
**Purpose:** Configure new trading account (currency, leverage, platform, password)

**APIs Called:**
| API Endpoint | Method | When Called | Request Data | Response Data Used | Service Function |
|---|---|---|---|---|---|
| /api/private/accounts | POST | On form submit | `{platform, mode, currency, leverage, group, nickname, password}` | New account | `tradingStore.createAccount()` |

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| mode | "demo" \| "real" | local | Account mode toggle |
| currency | string | local | Account currency |
| nickname | string | local | Account display name |
| leverage | string | local | Max leverage selection |
| platform | string | local | MT5/MT4/cTrader selection |
| initialBalance | string | local | Demo account starting balance |
| tradingPassword | string | local | MT5 trading password |

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| Demo/Real toggle | Click | Switches account mode, shows/hides balance field |
| Currency dropdown | Select | Sets account currency |
| Leverage dropdown | Select | Sets max leverage |
| Platform dropdown | Select | Selects trading platform |
| "Create Account" button | Submit | Creates account via API, shows toast, redirects |

---

### Account Settings — `app/account-settings/page.tsx`
**Route:** `/account-settings`
**Purpose:** Individual account settings (leverage, rename, statements)

**User Interactions:**
| Element | Action | What Happens |
|---|---|---|
| Leverage dropdown | Select + Save | Updates account leverage |
| Rename input | Type + Update | Changes account display name |
| Generate investor password | Click | Creates read-only access password |
| Download statement | Click | Downloads daily/weekly/monthly statement |

---

### Tools: Calculator — `app/tools/calculator/page.tsx`
**Route:** `/tools/calculator`
**Purpose:** Pip Value, Margin, and Profit/Loss calculators

**State Variables:**
| Variable | Type | Source | Purpose |
|---|---|---|---|
| activeTab | string | local | Selected calculator tab |
| pair | string | local | Currency pair |
| volume | number | local | Trade volume in lots |
| pips/price/leverage | number | local | Calculator-specific input |
| result | number | Computed | Calculated value |

---

### Tools: Converter — `app/tools/converter/page.tsx`
**Route:** `/tools/converter`
**Purpose:** Currency converter supporting 8 currencies

---

### Tools: Tick History — `app/tools/tick-history/page.tsx`
**Route:** `/tools/tick-history`
**Purpose:** Historical tick data viewer (sample data)

---

## SECTION 5: Reusable Component Library

### Button — `components/ui/button.tsx`
**Purpose:** Primary interactive button with multiple variants
**Props:**
| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| variant | `"default"` \| `"destructive"` \| `"outline"` \| `"secondary"` \| `"ghost"` \| `"link"` | No | `"default"` | Visual style variant |
| size | `"default"` \| `"sm"` \| `"lg"` \| `"icon"` | No | `"default"` | Button size |
| asChild | boolean | No | false | Render as child element (Radix Slot) |
| className | string | No | — | Additional CSS classes |
**Used In:** Every page and modal across the application

### Card — `components/ui/card.tsx`
**Purpose:** Container card with header, title, description, content, and footer slots
**Sub-components:** `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
**Used In:** Dashboard widgets, accounts, wallet, settings, notifications, markets, analytics

### Dialog — `components/ui/dialog.tsx`
**Purpose:** Modal dialog overlay built on Radix UI Dialog
**Sub-components:** `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`
**Used In:** CreateAccountModal, AccountCredentialsModal, ChangePasswordModal, FundDetailsDialog, StrategyDetailsModal, FullAnalysisModal, TransferModal, MarketOverviewSettingsModal

### Input — `components/ui/input.tsx`
**Purpose:** Text input field with consistent styling
**Props:**
| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| type | string | No | `"text"` | Input type |
| className | string | No | — | Additional CSS classes |
**Used In:** Login, Register, Account Setup, Wallet, Search fields, Settings forms

### Label — `components/ui/label.tsx`
**Purpose:** Form field label built on Radix UI Label
**Used In:** All forms throughout the application

### Select — `components/ui/select.tsx`
**Purpose:** Dropdown select built on Radix UI Select
**Sub-components:** `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator`
**Used In:** Account creation, Wallet currency selection, Leverage picker, Platform selection

### Table — `components/ui/table.tsx`
**Purpose:** Data table with header, body, footer, rows, cells
**Sub-components:** `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`
**Used In:** Transaction history, Trade history, Referral list, Conditions page

### Tabs — `components/ui/tabs.tsx`
**Purpose:** Tab navigation built on Radix UI Tabs
**Sub-components:** `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
**Used In:** Dashboard, Copy Trading, Social Trading, Journal, Wallet, Analytics

### Badge — `components/ui/badge.tsx`
**Purpose:** Status indicator badge
**Props:**
| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| variant | `"default"` \| `"secondary"` \| `"success"` \| `"warning"` \| `"danger"` \| `"outline"` | No | `"default"` | Badge color/style |
**Used In:** Account status, Trade type, Notification type, Order status

### Alert — `components/ui/alert.tsx`
**Purpose:** Alert banner with title and description
**Sub-components:** `Alert`, `AlertTitle`, `AlertDescription`
**Used In:** Crypto deposit warnings, Error messages

### Checkbox — `components/ui/checkbox.tsx`
**Purpose:** Checkbox input with custom styling
**Used In:** Registration (terms acceptance), Settings

### Dropdown Menu — `components/ui/dropdown-menu.tsx`
**Purpose:** Context/dropdown menu built on Radix UI
**Sub-components:** Full set including `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuGroup`, `DropdownMenuSub`
**Used In:** ProfileDropdown, Account action menus

### Switch — `components/ui/switch.tsx`
**Purpose:** Toggle switch built on Radix UI Switch
**Used In:** Settings (2FA, notifications), Demo/Real toggle

### Separator — `components/ui/separator.tsx`
**Purpose:** Visual divider line
**Used In:** Sidebar, Settings, Modals

### Scroll Area — `components/ui/scroll-area.tsx`
**Purpose:** Custom scrollbar area built on Radix UI
**Used In:** Sidebar, MarketWatchPanel, long lists

### Skeleton — `components/ui/skeleton.tsx`
**Purpose:** Loading placeholder with pulse animation
**Used In:** All loading.tsx files, dashboard loading states

### Resizable — `components/ui/resizable.tsx`
**Purpose:** Resizable panel layout built on react-resizable-panels
**Sub-components:** `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`
**Used In:** WebTrader layout

### Page Loader — `components/ui/page-loader.tsx`
**Purpose:** Route transition progress bar (animated from 0 → 80% → 100%)
**Used In:** Root layout (globally active)

### Toast Container — `components/ui/toast-container.tsx`
**Purpose:** Toast notification display with animated entry/exit
**Props:** Reads from `toast-store`
**Types:** `success`, `error`, `info`
**Used In:** Root layout (globally active)

### Brand Badge — `components/branding/brand-badge.tsx`
**Purpose:** FxTrusts logo with dark/light mode variants
**Props:**
| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| size | `"sm"` \| `"md"` \| `"lg"` | No | `"md"` | Logo size |
**Used In:** Sidebar, Login, Register, WebTrader

### Crypto Icons — `components/icons/crypto-icons.tsx`
**Purpose:** SVG icons for Bitcoin, Ethereum, Tron, Tether, USDC with network badges
**Exports:** `BitcoinIcon`, `EthereumIcon`, `TronIcon`, `TetherIcon`, `UsdcIcon`
**Used In:** Crypto wallet, Crypto deposit

### Market Gauge — `components/dashboard/widgets/market-gauge.tsx`
**Purpose:** Animated SVG gauge displaying market sentiment (-75 to 75 range)
**Props:**
| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| score | number | Yes | — | Sentiment value (-75 to 75) |
| label | string | No | — | Display label |
**Used In:** MarketOverviewWidget

---

## SECTION 6: API Service Layer (COMPLETE API MAP)

### HTTP Client Setup

**Architecture:** Next.js API Routes act as a BFF (Backend-for-Frontend) layer. The frontend uses native `fetch()` to call its own `/api/*` routes, which then proxy to backend microservices.

**Auth Token Attachment:**
- Session cookie (`dm_session`) is set as `httpOnly` by the login API route
- Browser automatically sends the cookie with every request to `/api/*`
- `middleware.ts` validates the session cookie on every request to `/api/private/*`
- Server-side API routes read the cookie via `cookies().get(SESSION_COOKIE_NAME)`

**Global Error Handling:**
- API routes return structured JSON: `{ error: string }` with appropriate HTTP status
- 401 responses trigger the middleware to redirect to `/login`
- `ApiError` class in `api-provider.ts` wraps fetch errors with retry logic (exponential backoff, max 3 retries)
- User-friendly error messages map technical errors to readable text
- Toast store displays errors globally via `ToastContainer`

**Request/Response Flow:**
```
Browser → fetch("/api/private/...") → Next.js Middleware (session check)
  → API Route Handler → lib/server/*.ts (business logic)
  → External Backend (accounts-backend, wallet-backend, MT5)
  → Response → Client
```

### Complete API Function Table

| Service Function | HTTP Method | Endpoint | Request Payload | Response Type | Used In (Pages/Components) |
|---|---|---|---|---|---|
| login | POST | /api/auth/login | `{email, password}` | `{user: AuthUser}` + session cookie | LoginPageClient |
| logout | POST | /api/auth/logout | — | `{ok: true}` + clears cookie | AuthProvider, ProfileDropdown |
| getCurrentUser | GET | /api/auth/me | — | `{user: AuthUser}` | AuthProvider (on refresh) |
| register | POST | /api/auth/register | `{name, email, phone, country, password}` | `{user: AuthUser}` + session cookie | RegisterPageClient |
| getPublicSnapshot | GET | /api/dashboard/snapshot | — | `DashboardSnapshot` | Public dashboard |
| getPrivateSnapshot | GET | /api/private/dashboard/snapshot | — | `DashboardSnapshot` (merged backend + local) | DashboardDataProvider |
| syncPositions | POST | /api/private/dashboard/positions/sync | — | `{positions: Position[]}` | ActivePositionsWidget |
| listAccounts | GET | /api/private/accounts | — | `{accounts: TradingAccount[]}` | AccountsPage, AccountOverviewWidget |
| createAccount | POST | /api/private/accounts | `{platform, mode, currency, leverage, group, nickname, password}` | `{account: TradingAccount}` | CreateAccountModal, OpenAccountSetup |
| deleteAccount | DELETE | /api/private/accounts/[id] | — | `{ok: true}` | AccountsPage |
| updateAccountStatus | PATCH | /api/private/accounts/[id]/status | `{status: "Active" \| "Archived"}` | `{account: TradingAccount}` | AccountsPage |
| changeAccountPassword | POST | /api/private/accounts/[id]/password | `{newPassword, type}` | `{ok: true}` | ChangePasswordModal |
| verifyCredentials | POST | /api/private/accounts/[id]/credentials/verify | `{login, password}` | `{valid: boolean}` | AccountCredentialsModal |
| syncBalance | POST | /api/private/accounts/[id]/sync-balance | — | `{balance, equity, freeMargin}` | AccountsPage |
| syncAllBalances | POST | /api/private/accounts/sync-all-balances | — | `{results: {...}[]}` | AccountsPage |
| submitFunds | POST | /api/private/wallet/funds | `{type, currency, amount, method}` | `{transaction: Transaction}` | WalletPage, DepositWithdrawalWidget |
| getTransactions | GET | /api/private/wallet/transactions | — | `{transactions: Transaction[]}` | TransactionHistoryPage, WalletPage |
| transferFunds | POST | /api/private/wallet/transfer | `{from, to, amount, currency}` | `{transaction: Transaction}` | TransferModal |
| getJournalStats | GET | /api/private/journal/stats | — | `{stats: JournalStats}` | JournalDashboard |
| getEquityCurve | GET | /api/private/journal/equity-curve | — | `{data: EquityPoint[]}` | EquityCurveChart |
| getJournalNotes | GET | /api/private/journal/notes | — | `{notes: Note[]}` | JournalDashboard |
| createJournalNote | POST | /api/private/journal/notes | `{title, content, tags}` | `{note: Note}` | JournalDashboard |
| deleteJournalNote | DELETE | /api/private/journal/notes/[id] | — | `{ok: true}` | JournalDashboard |
| runMonteCarlo | POST | /api/private/journal/monte-carlo | `{trades, simulations}` | `{results: MonteCarloResult}` | JournalDashboard |
| getPatterns | GET | /api/private/journal/patterns | — | `{patterns: Pattern[]}` | JournalDashboard |
| getProjections | GET | /api/private/journal/projections | — | `{projections: Projection[]}` | JournalDashboard |
| generateReport | POST | /api/private/journal/reports | `{type, period}` | `{report: Report}` | JournalDashboard |
| getCopyStrategies | GET | /api/private/copy-trading | — | `{strategies: Strategy[]}` | CopyTradingDashboard |
| copyStrategy | POST | /api/private/copy-trading | `{strategyId, action}` | `{ok: true}` | CopyTradingDashboard |
| getPAMMAccounts | GET | /api/private/mm/accounts | — | `{accounts: PAMMAccount[]}` | MoneyManagementDashboard |
| getPAMMTransactions | GET | /api/private/mm/transactions | — | `{transactions: Transaction[]}` | MoneyManagementDashboard |
| investInFund | POST | /api/private/mm/transfers | `{fundId, amount, idempotencyKey}` | `{transfer: Transfer}` | MoneyManagementDashboard |
| getNotifications | GET | /api/private/notifications | — | `{notifications: Notification[]}` | NotificationStore |
| createNotification | POST | /api/private/notifications | `{title, message, type}` | `{notification: Notification}` | System-generated |
| markNotificationRead | PUT | /api/private/notifications | `{id}` or `{all: true}` | `{ok: true}` | NotificationsDropdown, NotificationsPage |
| getPartnerStats | GET | /api/private/partner?type=stats | — | `{stats: PartnerStats}` | PartnerDashboard |
| getPartnerCommissions | GET | /api/private/partner?type=commissions | — | `{commissions: Commission[]}` | PartnerDashboard |
| getProfile | GET | /api/private/profile | — | `{profile: UserProfile}` | SettingsProfileDashboard |
| updateProfile | PATCH | /api/private/profile | `{name, phone, country}` | `{profile: UserProfile}` | SettingsProfileDashboard |
| getReferrals | GET | /api/private/referrals | — | `{stats, referrals}` | InviteFriendsPage |
| getRewards | GET | /api/private/rewards | — | `{tier, rewards}` | RewardsPage |
| claimReward | POST | /api/private/rewards | `{rewardId}` | `{ok: true}` | RewardsPage |
| getSettings | GET | /api/private/settings | — | `{settings: Settings}` | SettingsSecurityDashboard |
| updateSettings | PUT | /api/private/settings | `{setting, value}` | `{settings: Settings}` | SettingsSecurityDashboard |
| getSocialStrategies | GET | /api/private/social/strategies | — | `{strategies: SocialStrategy[]}` | SocialTradingDashboard |
| getTickets | GET | /api/private/support/tickets | — | `{tickets: Ticket[]}` | SupportHubDashboard |
| createTicket | POST | /api/private/support/tickets | `{category, subject, description, priority}` | `{ticket: Ticket}` | OpenTicketDashboard |
| getTicketDetails | GET | /api/private/support/tickets/[id] | — | `{ticket: Ticket, replies}` | SupportHubDashboard |
| replyToTicket | POST | /api/private/support/tickets/[id] | `{message}` | `{reply: Reply}` | SupportHubDashboard |
| getTradingHistory | GET | /api/private/trading/history | `?account=&period=` | `{trades: Trade[]}` | HistoryDashboard |
| getTradingPerformance | GET | /api/private/trading/performance | `?account=&period=` | `{performance: Performance}` | PerformanceDashboard |
| testDB | GET | /api/test-db | — | `{ok: true, tables}` | Development only |

### WebTrader API Stubs (Not Yet Implemented)

| Endpoint | Methods | Status |
|---|---|---|
| /api/trading/auth | POST, DELETE | Returns `NOT_IMPLEMENTED` |
| /api/trading/account | GET | Returns `NOT_IMPLEMENTED` |
| /api/trading/symbols | GET | Returns `NOT_IMPLEMENTED` |
| /api/trading/positions | GET, DELETE | Returns `NOT_IMPLEMENTED` |
| /api/trading/orders | GET, POST, PATCH, DELETE | Returns `NOT_IMPLEMENTED` |
| /api/trading/history | GET | Returns `NOT_IMPLEMENTED` |

---

## SECTION 7: State Management (Complete)

### Trading Store — `store/trading-store.ts`
**Purpose:** Central store for wallets, trading accounts, positions, and transactions

**State Shape:**
| Field | Type | Description |
|---|---|---|
| wallets | `{USD: {balance}, EUR: {balance}}` | Wallet balances by currency |
| accounts | `TradingAccount[]` | All trading accounts (MT5/cTrader) |
| positions | `Position[]` | Open trading positions |
| transactions | `Transaction[]` | Transaction history |
| pnlData | `PnlDataPoint[]` | Profit/loss chart data |

**Actions:**
| Action | Payload | What It Does |
|---|---|---|
| hydrateFromSnapshot | `DashboardSnapshot` | Populates all state from API snapshot |
| submitFunds | `{type, currency, amount, method}` | POST to /api/private/wallet/funds, updates balance |
| transferFunds | `{from, to, amount, currency}` | POST to /api/private/wallet/transfer, updates balances |
| createAccount | `{platform, mode, ...}` | POST to /api/private/accounts, adds to accounts array |
| archiveAccount | `{accountId}` | PATCH status to Archived |
| deleteAccount | `{accountId}` | DELETE account from list |
| syncAccountBalance | `{accountId}` | POST sync, updates account balance |
| syncAllBalances | — | POST sync all, updates all account balances |

**Consumed By:** DashboardShell, AccountsPage, WalletPage, DepositWithdrawalWidget, AccountOverviewWidget, TransferModal, OpenAccountSetup
**Updated By:** DashboardDataProvider (hydration), AccountsPage, WalletPage, DepositWithdrawalWidget

---

### WebTrader Store — `store/webtrader-store.ts`
**Purpose:** Complete WebTrader state including MT5 session, symbols, prices, positions, orders, and UI

**State Shape:**
| Field | Type | Description |
|---|---|---|
| isConnected | boolean | WebSocket connection status |
| isConnecting | boolean | Connection in progress |
| session | `TradingSession \| null` | MT5 session data |
| accountInfo | `TradingAccountInfo \| null` | Balance, equity, margin info |
| symbols | `SymbolInfo[]` | Available trading instruments |
| positions | `Position[]` | Open positions |
| orders | `Order[]` | Pending orders |
| deals | `Deal[]` | Historical deals |
| priceTicks | `Map<string, PriceTick>` | Latest bid/ask per symbol |
| selectedSymbol | `string` | Currently selected instrument |
| chartTimeframe | `string` | Chart period (M1, H1, D1, etc.) |
| chartType | `string` | Chart type (candle, line, bar) |
| orderForm | `OrderForm` | Current order form state |
| panels | `{marketWatch, trading, positions, orders}` | Panel visibility flags |

**Actions:**
| Action | Payload | What It Does |
|---|---|---|
| connect | `{login, password, server}` | Authenticates and opens WebSocket |
| disconnect | — | Closes WebSocket and clears session |
| setSelectedSymbol | `string` | Changes selected instrument |
| updatePriceTick | `PriceTick` | Updates latest price for symbol |
| updatePositions | `Position[]` | Replaces positions list |
| updateOrders | `Order[]` | Replaces orders list |
| setOrderForm | `Partial<OrderForm>` | Updates order form fields |
| togglePanel | `string` | Shows/hides a panel |

**Middleware:** `devtools`, `immer`, `persist` (localStorage key: `webtrader-store`)
**Consumed By:** WebtraderLayout, TradingPanel, PositionsTable, PendingOrdersTable, MarketWatchPanel, AccountInfoBar, TradingViewChart
**Updated By:** WebSocketClient (real-time updates), TradingPanel (user actions)

---

### Dashboard Layout Store — `store/dashboard-layout-store.ts`
**Purpose:** Manages widget grid layout, edit mode, and widget visibility

**State Shape:**
| Field | Type | Description |
|---|---|---|
| layouts | `Layouts` | react-grid-layout layouts for lg/md/sm |
| hiddenWidgets | `string[]` | Widget IDs currently hidden |
| editMode | boolean | Whether grid is in edit mode |
| savedLayouts | `Layouts \| null` | Backup for cancel operation |
| savedHiddenWidgets | `string[] \| null` | Backup for cancel operation |

**Actions:**
| Action | Payload | What It Does |
|---|---|---|
| setEditMode | `boolean` | Enables/disables edit mode (saves backup on enable) |
| updateLayouts | `Layouts` | Updates grid layouts |
| toggleWidget | `string` | Shows/hides a widget |
| saveLayout | — | Persists to localStorage, exits edit mode |
| cancelEdit | — | Reverts to saved backup, exits edit mode |

**Persistence:** localStorage key `dashboard-layout`
**Consumed By:** DashboardShell, WidgetGrid, WidgetMarketplace
**Updated By:** DashboardShell (edit mode), WidgetGrid (drag/resize), WidgetMarketplace (toggle)

---

### Notification Store — `store/notification-store.ts`
**Purpose:** Manages notification state with backend sync

**State Shape:**
| Field | Type | Description |
|---|---|---|
| notifications | `Notification[]` | All notifications |
| unreadCount | number | Computed unread count |

**Actions:**
| Action | Payload | What It Does |
|---|---|---|
| fetchNotifications | — | GET /api/private/notifications, merges with local |
| addNotification | `Notification` | Adds to local list |
| markAsRead | `string` | Marks single notification as read |
| markAllRead | — | Marks all as read, PUT to API |

**Persistence:** localStorage key `notification-store`
**Consumed By:** Navbar (bell icon badge), NotificationsDropdown, NotificationsPage
**Updated By:** System events, NotificationsPage (mark read), NotificationsDropdown

---

### Toast Store — `store/toast-store.ts`
**Purpose:** Ephemeral toast notifications with auto-dismiss

**State Shape:**
| Field | Type | Description |
|---|---|---|
| toasts | `{id, message, type, timestamp}[]` | Active toasts |

**Actions:**
| Action | Payload | What It Does |
|---|---|---|
| addToast | `{message, type}` | Adds toast, auto-removes after 3s |
| removeToast | `string` | Removes toast by ID |

**Consumed By:** ToastContainer (root layout)
**Updated By:** Any component/store that needs to show feedback

---

### Roulette Store — `store/roulette-store.ts`
**Purpose:** Roulette mini-game state with point tracking

**State Shape:**
| Field | Type | Description |
|---|---|---|
| points | number | Total accumulated points |
| history | `{result, color, timestamp}[]` | Last 10 game results |

**Actions:**
| Action | Payload | What It Does |
|---|---|---|
| addPoints | `number` | Adds/subtracts points |
| addToHistory | `{result, color}` | Records game result (max 10) |

**Persistence:** localStorage key `roulette-store`
**Consumed By:** RouletteGame, CardColorGame, CrashGame, EntertainmentWidget
**Updated By:** Game components on win/lose

---

## SECTION 8: Authentication Flow (Frontend Side - Complete)

### Step-by-Step Login Flow

1. **User navigates to `/login`** — GlobalLayoutWrapper hides Sidebar/Navbar
2. **User enters email + password** on `LoginPageClient` component
3. **Frontend calls `POST /api/auth/login`** with `{email, password}`
4. **API route (`app/api/auth/login/route.ts`):**
   - Validates credentials via `lib/server/auth.ts` (scrypt password hash comparison)
   - Creates session token stored in in-memory database (`lib/server/database.ts`)
   - Sets `httpOnly` cookie named `dm_session` with session token value, TTL = 24 hours
   - Returns `{user: {id, email, name, role}}`
5. **AuthProvider updates state:**
   - Sets `user` to the returned user object
   - Sets `isAuthenticated = true`
   - Stores user in React Context
6. **User redirected to `/dashboard`** via `router.push("/dashboard")`
7. **On every subsequent API call:**
   - Browser automatically sends `dm_session` cookie
   - `middleware.ts` validates session by reading cookie and checking against session store
   - If valid, request proceeds to API route handler
   - API route reads user from session for authorization
8. **On page refresh:**
   - `AuthProvider` calls `GET /api/auth/me` on mount
   - API route reads `dm_session` cookie, looks up session, returns user
   - If valid, user stays authenticated
   - If invalid/expired, user redirected to `/login`
9. **If session expired/invalid:**
   - API routes return 401
   - Middleware redirects page requests to `/login`
   - AuthProvider clears user state
10. **Logout:**
    - Frontend calls `POST /api/auth/logout`
    - API route revokes session in database
    - Clears `dm_session` cookie
    - AuthProvider sets `user = null`, `isAuthenticated = false`
    - User redirected to `/login`

### Token Storage

- **Where:** `httpOnly` cookie named `dm_session`
- **TTL:** 24 hours (defined in `lib/auth/constants.ts` as `SESSION_TTL = 86_400`)
- **Security:** `httpOnly` flag prevents JavaScript access; cookie is sent automatically by browser

### Token Refresh

No explicit token refresh mechanism. Sessions are valid for 24 hours. User must re-login after expiry.

### "Remember Me"

Not implemented. Session always expires after 24 hours.

### Social Login

Not implemented. Only email/password authentication.

### WebTrader Authentication (Separate)

WebTrader uses a completely separate authentication flow:
1. User enters MT5 account number + password + server on `/webtrader/login`
2. Frontend sends credentials to WebSocket server via `socket.io-client`
3. Server validates against MT5 Manager API
4. On success, a `TradingSession` is created and stored in `webtrader-store`
5. WebSocket connection maintained for real-time price updates
6. Session persisted in localStorage via Zustand persist middleware

---

## SECTION 9: Forms & Validation

| Form | Page | Fields | Validation Rules | API Called on Submit |
|---|---|---|---|---|
| Login Form | `/login` | email (required), password (required) | Email format check, min length | POST /api/auth/login |
| Register Form | `/register` | name (required), email (required, email format), phone (required), country (required), password (required, min 8 chars), terms (must be accepted) | Inline validation, terms checkbox required | POST /api/auth/register |
| Account Setup Form | `/open-account/setup` | mode (demo/real), currency (required), nickname (optional), leverage (required), platform (required), initialBalance (demo only), tradingPassword (MT5 only, min 8 chars, uppercase + digit required) | Platform-conditional fields, password strength rules | POST /api/private/accounts |
| Deposit Form | `/wallet` | currency (USD/EUR), amount (required, > 0), method (required) | Amount must be positive number | POST /api/private/wallet/funds |
| Withdrawal Form | `/wallet` | currency (USD/EUR), amount (required, > 0, <= balance), method (required) | Amount must not exceed balance | POST /api/private/wallet/funds |
| Transfer Form | Transfer Modal | from (wallet/account), to (wallet/account), amount (required, > 0), currency | From/To must differ, amount <= source balance | POST /api/private/wallet/transfer |
| Change Password Form | Change Password Modal | current verification, new password (min 8, uppercase + digit), confirm password | Passwords must match, strength validation | POST /api/private/accounts/[id]/password |
| Support Ticket Form | `/support/open-ticket` | category (required), subject (required), description (required, min 20 chars), priority (required) | Multi-step wizard, all fields required | POST /api/private/support/tickets |
| Profile Settings Form | `/settings/profile` | name, phone, country | Optional fields, at least one change required | PATCH /api/private/profile |
| Journal Note Form | `/journal` | title (required), content (required), tags (optional) | Title and content required | POST /api/private/journal/notes |
| MT5 Login Form | `/webtrader/login` | login (required, numeric), password (required), server (required) | MT5 account number format | WebSocket auth |
| Trading Order Form | `/webtrader` | symbol, volume (min lot), type (buy/sell), stopLoss (optional), takeProfit (optional), deviation | Volume within lot constraints per symbol | WebSocket order |
| Create Fund Form | `/money-management` | name, description, minInvestment, performanceFee, riskLevel | All required, numeric validations | POST /api/private/mm/transfers |
| Calculator Form | `/tools/calculator` | pair, volume, pips/price/leverage | Numeric inputs, pair selection | Client-side calculation only |
| Converter Form | `/tools/converter` | amount (required, > 0), fromCurrency, toCurrency | Positive number, different currencies | Client-side calculation only |
| Account Rename Form | `/account-settings` | nickname (required) | Non-empty string | Inline save |
| Leverage Change Form | `/account-settings` | leverage (required) | Must be valid leverage value | Inline save |

---

## SECTION 10: UI/Styling System

### CSS Approach

**Primary:** Tailwind CSS v3.4.17 with custom configuration
**Utility Merging:** `cn()` function combining `clsx` + `tailwind-merge` for conflict-free class composition
**Component Variants:** `class-variance-authority` (CVA) for variant-based styling (Button, Badge)

### Theme Configuration

**Colors (CSS Variables in `globals.css`):**
```css
/* Light Mode */
--background: 0 0% 100%;
--foreground: 240 10% 3.9%;
--primary: 240 5.9% 10%;
--secondary: 240 4.8% 95.9%;
--muted: 240 4.8% 95.9%;
--accent: 240 4.8% 95.9%;
--destructive: 0 84.2% 60.2%;

/* Dark Mode */
--background: 240 10% 3.9%;
--foreground: 0 0% 98%;
--primary: 0 0% 98%;
--muted: 240 3.7% 15.9%;
--success: 142.1 76.2% 36.3%;
--warning: 47.9 95.8% 53.1%;
```

**Fonts:** Inter (Google Fonts, variable weight)

**Custom Shadows:**
```
fintech: "0 0 15px -3px rgba(59, 130, 246, 0.15)"
fintech-xl: "0 0 30px -5px rgba(59, 130, 246, 0.2)"
```

### Dark Mode

- **Implementation:** `next-themes` with `attribute="class"` and `defaultTheme="dark"`
- **Toggle:** Theme switch in Navbar component
- **Storage:** localStorage via next-themes (key: `theme`)
- **CSS:** Uses Tailwind's `dark:` variant prefix, backed by CSS custom properties

### Responsive Design Breakpoints

| Breakpoint | Width | Usage |
|---|---|---|
| `sm` | 640px | Mobile adjustments |
| `md` | 768px | Tablet layout |
| `lg` | 1024px | Desktop layout |
| `xl` | 1280px | Wide desktop |
| `2xl` | 1400px | Extra wide (custom container) |

### Animation Library

**Framer Motion** (`framer-motion ^11.18.2`):
- Page transitions (fade-in, slide-up)
- Modal enter/exit animations
- Toast notification slide-in/out
- Card hover effects
- WebTrader login page entrance

**tailwindcss-animate:** Provides CSS-only animations for UI primitives

**Custom Keyframe Animations:**
- `scale-in` — Scale from 0.95 to 1 with fade
- `roulette-spin` — Roulette wheel rotation (multiple full turns)
- React Grid Layout drag/drop animations

### Icon Library

**lucide-react** (`^0.563.0`):
- Used across entire application for all UI icons
- Examples: `ArrowLeft`, `Bell`, `Settings`, `DollarSign`, `TrendingUp`, `Shield`, etc.

**Custom SVG Icons:**
- `crypto-icons.tsx` — Bitcoin, Ethereum, Tron, Tether, USDC icons with network badges

---

## SECTION 11: Error Handling & Loading States

### Global Error Handling

- **No global error boundary** is defined (no `error.tsx` files)
- Each page/component handles errors locally via try/catch in fetch calls
- `ApiError` class in `lib/dashboard/api-provider.ts` provides structured error handling with retry

### API Error Display

- **Toasts:** Most API errors trigger `toastStore.addToast({message, type: "error"})` — displayed globally via `ToastContainer`
- **Inline Messages:** Login/Register forms show error text directly below the form
- **Alert Components:** Crypto deposit page uses `Alert` component for warnings

### Loading States

- **Skeleton Loaders:** Every route group has a `loading.tsx` file that renders skeleton UI with `animate-pulse` classes
  - Dashboard: 3 stat cards + content area
  - Wallet: 3 stat cards + main content
  - Markets: Title + filter buttons + large content area
  - Analytics: Header + 2-column grid
  - Trading: Header + chart + content area
  - Settings: Header + 3 settings cards + content area
- **Page Loader:** `PageLoader` component shows a progress bar at the top during route transitions (0% → 80% → 100%)
- **Component-level Loading:** Individual components use `isLoading` state with conditional Skeleton rendering
- **Dynamic Imports:** Social Trading and Journal pages use `next/dynamic` with custom loading skeletons

### Empty States

- Transaction history shows "No transactions found" with filter adjustment suggestion
- Notification list shows "All caught up!" when no unread notifications
- Tick history shows sample data with note to connect account for real data

### Offline Handling

Not implemented. No service worker or offline detection.

---

## SECTION 12: Environment Variables

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_DASHBOARD_DATA_SOURCE` | Dashboard data provider type | `api` or `mock` |
| `MT5_MANAGER_HOST` | Primary MT5 Manager API host | `192.168.1.100` |
| `MT5_MANAGER_HOST_FALLBACK` | Fallback MT5 Manager API host | `192.168.1.101` |
| `MT5_MANAGER_PORT` | MT5 Manager API port | `443` |
| `MT5_MANAGER_LOGIN` | MT5 Manager account login | `1000` |
| `MT5_MANAGER_PASSWORD` | MT5 Manager account password | `managerPass123` |
| `ACCOUNTS_BACKEND_URL` | Accounts backend service URL | `http://localhost:4001` |
| `WALLET_BACKEND_URL` | Wallet backend service URL | `http://localhost:4002` |

*Environment variables without `NEXT_PUBLIC_` prefix are server-only and used exclusively in API route handlers and `lib/server/` modules.*

---

## SECTION 13: How to Run

### Prerequisites

- **Node.js** v18+ (LTS recommended)
- **npm** (comes with Node.js)
- **Git** (for version control)
- **PowerShell** (Windows, for MT5 Manager scripts — optional)

### Installation

```bash
cd Forex-CRM/frontend
npm install
```

### Environment Setup

Create a `.env.local` file in the `frontend/` directory:

```env
# Dashboard data source: "api" (real backend) or "mock" (local mock data)
NEXT_PUBLIC_DASHBOARD_DATA_SOURCE=mock

# MT5 Manager (optional, only needed for live MT5 account provisioning)
MT5_MANAGER_HOST=your-mt5-host
MT5_MANAGER_HOST_FALLBACK=your-mt5-fallback-host
MT5_MANAGER_PORT=443
MT5_MANAGER_LOGIN=your-manager-login
MT5_MANAGER_PASSWORD=your-manager-password

# Backend services (optional, only needed for full backend integration)
ACCOUNTS_BACKEND_URL=http://localhost:4001
WALLET_BACKEND_URL=http://localhost:4002
```

### Dev Server

```bash
npm run dev
```

Opens at `http://localhost:3000`

### Type Check

```bash
npm run typecheck
```

### Lint

```bash
npm run lint
```

### Build for Production

```bash
npm run build
```

### Serve Production Build

```bash
npm run start
```

Serves at `http://localhost:3000`
