'use client';

import type { Instrument } from '@/lib/terminal/types';
import {
    Menu,
    ChevronDown,
    Plus,
    User,
    UserCircle,
    X,
    Grid3X3,
    Clock,
    AlarmClock,
    Search,
    HelpCircle,
    GripVertical,
    ExternalLink,
    ChevronRight,
    Bell,
    CheckCheck,
    LayoutGrid,
    Globe,
    Users,
    ShieldCheck,
    MessageCircle,
    Lightbulb,
    LogOut,
    ChevronLeft
} from 'lucide-react';
import { SymbolIcon } from './SymbolIcon';
import { formatTerminalDisplaySymbol } from '@/lib/trading/terminal-symbols';
import { useTheme } from 'next-themes';
import { memo, startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { PriceAlertModal } from './PriceAlertModal';
import { LoginModal } from './LoginModal';
import { useAuth } from '@/components/auth/auth-provider';
import { usePriceBySymbol } from '@/store/webtrader-store';

export interface UserProfile {
    name: string;
    email: string;
    isVerified: boolean;
}

export interface AppNotification {
    id: string;
    title: string;
    message: string;
    date: string;
    isRead: boolean;
    groupLabel?: string;
}

export interface TradingAccount {
    id: string;
    label?: string;
    isReal: boolean;
    isMT5: boolean;
    type: string;
    balance: number;
    currency: string;
}

interface AccountInfo {
    balance: number;
    equity: number;
    margin: number;
    freeMargin: number;
    profit: number;
    marginLevel: number;
    leverage?: number;
    currency?: string;
}

interface HeaderProps {
    account: AccountInfo;
    selectedSymbol: string;
    openTabs: string[];
    userProfile?: UserProfile;
    notifications?: AppNotification[];
    onSelectTab: (symbol: string) => void;
    onCloseTab: (symbol: string) => void;
    onToggleSidebar: (panel: 'instruments' | 'calendar' | 'alerts' | 'settings' | 'signals' | 'positions' | 'more' | null) => void;
    onReorderTabs?: (newTabs: string[]) => void;
    onTopUp?: () => void;
    onMarkNotificationsRead?: () => void;
    onAddPriceAlert?: (symbol: string, price: number) => void;
    availableInstruments?: InstrumentMenuItem[];
    accounts?: TradingAccount[];
    activeAccountId?: string;
    onSwitchAccount?: (id: string) => void;
    onShowToast?: (type: 'success' | 'info' | 'topup' | 'warning' | 'error', title: string, message?: string) => void;
    onOpenOrderPanel?: () => void;
}

type InstrumentMenuItem = Pick<Instrument, 'symbol' | 'name' | 'category' | 'digits'>;

interface HeaderInstrumentMenuRowProps {
    instrument: InstrumentMenuItem;
    onSelectTab: (symbol: string) => void;
    onAddPriceAlert?: (symbol: string, price: number) => void;
    onClose: () => void;
}

const HeaderInstrumentMenuRow = memo(function HeaderInstrumentMenuRow({
    instrument,
    onSelectTab,
    onAddPriceAlert,
    onClose,
}: HeaderInstrumentMenuRowProps) {
    const livePrice = usePriceBySymbol(instrument.symbol);
    const alertPrice = (livePrice?.bid ?? 0) > 0 ? livePrice?.bid ?? 0 : livePrice?.ask ?? 0;

    return (
        <div
            onClick={() => {
                onSelectTab(instrument.symbol);
                onClose();
            }}
            className="grid grid-cols-[auto_1fr_2fr_auto] gap-2 items-center px-4 py-2 hover:bg-accent/50 transition-colors cursor-pointer group border-b border-border/30 last:border-0 h-[44px]"
        >
            <GripVertical size={14} className="text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
            <div className="flex items-center gap-2 ml-1">
                <div className="flex items-center justify-center relative flex-shrink-0 scale-75 w-5 h-5 -ml-1">
                    <SymbolIcon symbol={instrument.symbol} />
                </div>
                <span className="text-[13px] font-bold text-foreground group-hover:text-primary transition-colors">{formatTerminalDisplaySymbol(instrument.symbol)}</span>
            </div>
            <span className="text-[12px] text-muted-foreground truncate pl-1">{instrument.name}</span>
            <button
                type="button"
                className="flex items-center text-muted-foreground/70 group-hover:text-primary transition-colors cursor-pointer"
                onClick={(e) => {
                    e.stopPropagation();
                    if (alertPrice > 0) {
                        onAddPriceAlert?.(instrument.symbol, alertPrice);
                    }
                }}
            >
                <Plus size={14} className="text-muted-foreground/70 group-hover:text-primary transition-colors" />
            </button>
        </div>
    );
});

function Header({ account, selectedSymbol, openTabs, userProfile, notifications, availableInstruments = [], accounts, activeAccountId, onSwitchAccount, onSelectTab, onCloseTab, onToggleSidebar, onReorderTabs, onTopUp, onMarkNotificationsRead, onAddPriceAlert, onShowToast, onOpenOrderPanel }: HeaderProps) {
    const { theme } = useTheme();
    const { logout } = useAuth();
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const [isMobileAccountMenuOpen, setIsMobileAccountMenuOpen] = useState(false);
    const [hideBalance, setHideBalance] = useState(false);

    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [isGridAppsMenuOpen, setIsGridAppsMenuOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isAlertsOpen, setIsAlertsOpen] = useState(false);
    const [isInstrumentsOpen, setIsInstrumentsOpen] = useState(false);
    const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState("Favorites");
    const [instrumentSearchTerm, setInstrumentSearchTerm] = useState("");
    const [isPriceAlertModalOpen, setIsPriceAlertModalOpen] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);

    const accountMenuRef = useRef<HTMLDivElement>(null);
    const mobileAccountMenuRef = useRef<HTMLDivElement>(null);
    const notificationsRef = useRef<HTMLDivElement>(null);
    const gridAppsMenuRef = useRef<HTMLDivElement>(null);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const alertsRef = useRef<HTMLDivElement>(null);
    const instrumentsRef = useRef<HTMLDivElement>(null);
    const categoryMenuRef = useRef<HTMLDivElement>(null);

    const [accountDropdownView, setAccountDropdownView] = useState<'main' | 'switch'>('main');
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

    const activeAcc: TradingAccount =
        (accounts || []).find(a => a.id === activeAccountId) ||
        {
            id: 'default-account',
            label: undefined,
            isReal: false,
            isMT5: true,
            type: 'Standard',
            balance: account.balance,
            currency: account.currency || 'USD',
        };
    const deferredInstrumentSearchTerm = useDeferredValue(instrumentSearchTerm);
    const deferredSelectedCategory = useDeferredValue(selectedCategory);
    const selectedInstrument = useMemo(
        () => availableInstruments.find((instrument) => instrument.symbol === selectedSymbol) ?? null,
        [availableInstruments, selectedSymbol],
    );
    const selectedInstrumentPrice = usePriceBySymbol(selectedInstrument?.symbol ?? selectedSymbol);

    const openPriceAlertModal = () => {
        if (!selectedInstrument) {
            onShowToast?.('warning', 'No live symbol selected', 'Select a live instrument before creating a price alert.');
            return;
        }

        if ((selectedInstrumentPrice?.bid ?? 0) <= 0 && (selectedInstrumentPrice?.ask ?? 0) <= 0) {
            onShowToast?.('warning', 'No live quote yet', 'Wait for the selected instrument to receive a live quote before creating an alert.');
            return;
        }

        setIsPriceAlertModalOpen(true);
    };

    const handleSignOut = async () => {
        if (isSigningOut) return;

        setIsSigningOut(true);
        setIsProfileMenuOpen(false);

        try {
            await logout();
            onShowToast?.('success', 'Signed Out', 'You have been successfully signed out.');
        } catch (error) {
            console.warn('Terminal sign out failed:', error);
            setIsSigningOut(false);
            onShowToast?.('error', 'Sign out failed', 'Please try again.');
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
                setIsAccountMenuOpen(false);
                setTimeout(() => setAccountDropdownView('main'), 200);
            }
            if (mobileAccountMenuRef.current && !mobileAccountMenuRef.current.contains(event.target as Node)) {
                setIsMobileAccountMenuOpen(false);
                setTimeout(() => setAccountDropdownView('main'), 200);
            }
            if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
                setIsNotificationsOpen(false);
            }
            if (gridAppsMenuRef.current && !gridAppsMenuRef.current.contains(event.target as Node)) {
                setIsGridAppsMenuOpen(false);
            }
            if (alertsRef.current && !alertsRef.current.contains(event.target as Node)) {
                setIsAlertsOpen(false);
            }
            if (instrumentsRef.current && !instrumentsRef.current.contains(event.target as Node)) {
                setIsInstrumentsOpen(false);
                setIsCategoryMenuOpen(false);
            }
            if (categoryMenuRef.current && !categoryMenuRef.current.contains(event.target as Node)) {
                setIsCategoryMenuOpen(false);
            }
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- Drag and Drop State ---
    const [draggedSymbol, setDraggedSymbol] = useState<string | null>(null);
    const [dragOverSymbol, setDragOverSymbol] = useState<string | null>(null);

    const handleDragStart = (e: React.DragEvent, symbol: string) => {
        setDraggedSymbol(symbol);
        e.dataTransfer.effectAllowed = 'move';
        // Make the drag ghost image semi-transparent
        if (e.target instanceof HTMLElement) {
            e.dataTransfer.setDragImage(e.target, 20, 20);
        }
    };

    const handleDragOver = (e: React.DragEvent, symbol: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (symbol !== draggedSymbol) {
            setDragOverSymbol(symbol);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        setDragOverSymbol(null);
    };

    const handleDrop = (e: React.DragEvent, targetSymbol: string) => {
        e.preventDefault();
        if (draggedSymbol && draggedSymbol !== targetSymbol && onReorderTabs) {
            const newTabs = [...openTabs];
            const draggedIdx = newTabs.indexOf(draggedSymbol);
            const targetIdx = newTabs.indexOf(targetSymbol);
            
            newTabs.splice(draggedIdx, 1);
            newTabs.splice(targetIdx, 0, draggedSymbol);
            
            onReorderTabs(newTabs);
        }
        setDraggedSymbol(null);
        setDragOverSymbol(null);
    };

    const handleDragEnd = () => {
        setDraggedSymbol(null);
        setDragOverSymbol(null);
    };

    const getAccountNumberLabel = (tradingAccount: TradingAccount) => {
        const idValue = (tradingAccount.id || '').trim();
        const idLogin = /^mt5-(\d+)$/i.exec(idValue)?.[1] ?? (/^\d+$/.test(idValue) ? idValue : '');
        if (idLogin) {
            return idLogin;
        }

        const labelValue = (tradingAccount.label || '').trim();
        const labelLogin = /^mt5-(\d+)$/i.exec(labelValue)?.[1] ?? (/^\d+$/.test(labelValue) ? labelValue : '');
        return labelLogin || 'unknown';
    };

    const renderAccountNumberLabel = (tradingAccount: TradingAccount) =>
        `Account #${getAccountNumberLabel(tradingAccount)}`;

    const renderAccountValue = (
        value: number | string | undefined,
        unit: string = activeAcc.currency || account.currency || 'USD',
    ) => {
        const strValue = typeof value === 'number'
            ? `${value.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${unit}`
            : (value || '-');

        return hideBalance && strValue !== '-' ? (
            <span className="blur-[4px] select-none opacity-80 pointer-events-none transition-all">{strValue}</span>
        ) : strValue;
    };

    const renderSwitchAccountView = (isMobile: boolean = false) => {
        const exnessAccounts = (accounts || []).filter(a => !a.isMT5);
        const mt5Accounts = (accounts || []).filter(a => a.isMT5);

        return (
            <div
                className="absolute right-0 top-[calc(100%+8px)] w-[min(92vw,300px)] h-[min(70dvh,440px)] flex flex-col bg-popover border border-border rounded-[8px] shadow-none z-[9999] animate-in fade-in slide-in-from-right-2 duration-200 overflow-hidden pointer-events-auto"
            >
                <button 
                    type="button"
                    className="w-full flex items-center px-4 py-3 border-b border-border cursor-pointer hover:bg-accent/50 transition-colors flex-shrink-0" 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAccountDropdownView('main'); }}
                >
                    <ChevronLeft size={16} className="text-muted-foreground mr-2 flex-shrink-0" />
                    <span className="text-[14px] text-foreground font-bold">Switch account</span>
                </button>

                <div
                    className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-2"
                >
                    <div className="flex flex-col">
                        {exnessAccounts.map(acc => (
                            <div 
                                key={acc.id} 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if (onSwitchAccount) onSwitchAccount(acc.id); 
                                    setIsAccountMenuOpen(false);
                                    setIsMobileAccountMenuOpen(false);
                                    setTimeout(() => setAccountDropdownView('main'), 200);
                                }}
                                className={`flex flex-col px-5 py-3 border-b border-border/50 cursor-pointer transition-colors ${acc.id === activeAccountId ? 'bg-accent shadow-none-[inset_2px_0_0_0_var(--gold)]' : 'hover:bg-accent/30'}`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[10px] font-bold px-1.5 py-[1px] rounded-none ${acc.isReal ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                                        {acc.isReal ? 'Real' : 'Demo'}
                                    </span>
                                    <span className="font-mono text-[12px] font-semibold text-foreground/90">{renderAccountNumberLabel(acc)}</span>
                                </div>
                                <span className="text-[13px] text-foreground font-bold">{acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-[11px] font-medium text-muted-foreground ml-0.5">{acc.currency}</span></span>
                            </div>
                        ))}
                    </div>

                    {mt5Accounts.length > 0 && (
                        <div className="flex flex-col mt-2 border-t border-border">
                            <span className="px-5 py-3 text-[12px] font-bold text-muted-foreground">MetaTrader terminal only</span>
                            {mt5Accounts.map(acc => (
                                <div 
                                    key={acc.id} 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        if (onSwitchAccount) onSwitchAccount(acc.id); 
                                        setIsAccountMenuOpen(false);
                                        setIsMobileAccountMenuOpen(false);
                                        setTimeout(() => setAccountDropdownView('main'), 200);
                                    }}
                                    className={`flex flex-col px-5 py-3 border-b border-border/50 cursor-pointer transition-colors ${acc.id === activeAccountId ? 'bg-accent shadow-none-[inset_2px_0_0_0_var(--primary)]' : 'hover:bg-accent/30'}`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-none bg-accent text-muted-foreground">MT5</span>
                                        <span className={`text-[10px] font-bold px-1.5 py-[1px] rounded-none ${acc.isReal ? 'border border-warning/30 text-warning' : 'border border-success/30 text-success'}`}>
                                            {acc.isReal ? 'Real' : 'Demo'}
                                        </span>
                                        <span className="font-mono text-[12px] font-semibold text-foreground/90">{renderAccountNumberLabel(acc)}</span>
                                    </div>
                                    <span className="text-[13px] text-foreground font-bold">{acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-[11px] font-medium text-muted-foreground ml-0.5">{acc.currency}</span></span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="border-t border-border mt-auto flex-shrink-0">
                    <button
                        type="button"
                        onClick={() => {
                            setIsAccountMenuOpen(false);
                            setIsMobileAccountMenuOpen(false);
                            setIsLoginModalOpen(true);
                        }}
                        className="w-full flex items-center px-5 py-3 cursor-pointer hover:bg-accent/50 transition-colors border-b border-border/50"
                    >
                        <Plus size={14} className="text-muted-foreground mr-2 flex-shrink-0" />
                        <span className="text-[13px] text-foreground font-bold">Login Account</span>
                    </button>
                    <a href="/accounts" target="_blank" rel="noopener noreferrer" className="flex items-center px-5 py-3 cursor-pointer hover:bg-accent/50 transition-colors group">
                        <span className="text-[13px] text-foreground font-bold mr-2">Manage Accounts</span>
                        <ExternalLink size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                    </a>
                </div>
            </div>
        );
    };

    const renderAccountDropdown = (isMobile: boolean = false) => {
        if (accountDropdownView === 'switch') return renderSwitchAccountView(isMobile);
        
        return (
        <div className="absolute right-0 top-[calc(100%+8px)] w-[min(92vw,300px)] max-h-[min(70dvh,440px)] overflow-y-auto overscroll-contain bg-popover border border-border rounded-[8px] shadow-none-[0_8px_32px_rgba(0,0,0,0.8)] z-[100] py-4 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex flex-col gap-3 px-5 mb-4">
                <div className="flex flex-col gap-1.5">
                    {[
                        { id: 'balance', label: 'Balance', value: renderAccountValue(account.balance), tooltip: 'Your funds ignoring the results of currently open positions.' },
                        { id: 'equity', label: 'Equity', value: renderAccountValue(account.equity), tooltip: 'Your account balance plus the floating profit/loss of your open positions.' },
                        { id: 'margin', label: 'Margin', value: renderAccountValue(account.margin), tooltip: 'The amount of funds required to open and maintain your current positions.' },
                        { id: 'freeMargin', label: 'Free margin', value: renderAccountValue(account.freeMargin), tooltip: 'The amount of funds available to open new positions.' },
                        { id: 'marginLevel', label: 'Margin level', value: renderAccountValue(account.marginLevel === 0 ? '-' : `${account.marginLevel}%`, ''), tooltip: 'The percentage ratio of Equity to Margin.' },
                        { id: 'accountLeverage', label: 'Account leverage', value: renderAccountValue(account.leverage && account.leverage > 0 ? `1:${account.leverage}` : '-', ''), tooltip: 'Your set account leverage ratio.' }
                    ].map((row) => (
                        <div key={row.id} className="flex items-center justify-between py-1 relative">
                            <span className="text-[13px] text-muted-foreground font-medium">{row.label}</span>
                            <div className="flex items-center gap-4">
                                <span className="text-[13px] text-foreground font-bold">{row.value}</span>
                                <div className="relative group/help flex items-center justify-center w-[14px] h-[14px] cursor-pointer">
                                    <HelpCircle size={14} className="text-muted-foreground/70 hover:text-foreground transition-colors" />
                                    {row.tooltip && (
                            <div className="absolute top-[calc(100%+8px)] right-[-12px] w-[240px] px-3 py-2.5 bg-popover text-foreground text-[12px] leading-relaxed rounded-[6px] font-medium opacity-0 pointer-events-none group-hover/help:opacity-100 transition-opacity z-[99999] shadow-none-[0_4px_12px_rgba(0,0,0,0.5)] border border-border [transition-delay:200ms]">
                                            <div className="absolute top-[-5px] right-[16px] w-2 h-2 bg-popover border-t border-l border-border rotate-45 pointer-events-none"></div>
                                            <span className="relative z-10 block whitespace-normal text-left">{row.tooltip}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    className="w-full py-[7px] bg-accent hover:bg-accent/80 text-foreground text-[13px] font-bold rounded-[4px] transition-colors mt-1"
                    onClick={() => {
                        if (onTopUp) {
                            onTopUp();
                            setIsAccountMenuOpen(false);
                            setIsMobileAccountMenuOpen(false);
                        }
                    }}
                >
                    Top Up
                </button>
            </div>

            <div className="h-[1px] bg-accent mx-4 mb-2" />

            <button
                type="button"
                className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-accent cursor-pointer transition-colors"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setHideBalance(!hideBalance); }}
            >
                <span className="text-[13px] text-foreground font-medium">Hide balance</span>
                <div className={`w-[28px] h-[16px] rounded-none relative transition-colors flex items-center ${hideBalance ? 'bg-primary' : 'bg-accent'}`}>
                    <div className={`absolute w-[12px] h-[12px] rounded-none transition-all duration-200 ${hideBalance ? 'left-[14px] bg-background shadow-[0_0_0_1px_hsl(var(--border))]' : 'left-[2px] bg-muted-foreground'}`} />
                </div>
            </button>

            <button 
                className="mt-1 flex items-center justify-between px-5 py-2.5 hover:bg-accent cursor-pointer transition-colors group w-full"
                onClick={() => {
                    onShowToast?.('success', 'Download Started', 'Your trading history log is being generated.');
                    setIsAccountMenuOpen(false);
                }}
            >
                <div className="flex items-center gap-2">
                    <span className="text-[13px] text-foreground font-medium">Download Trading Log</span>
                    <ExternalLink size={14} className="text-foreground" />
                </div>
            </button>

            <div className="h-[1px] bg-accent mx-4 my-2" />

            <button 
                type="button"
                className="w-full flex items-center justify-between px-5 pt-3 hover:bg-accent cursor-pointer transition-colors group pb-1"
                onClick={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    setAccountDropdownView('switch'); 
                }}
            >
                <span className="text-[13px] text-foreground font-medium">Switch account</span>
                <ChevronRight size={14} className="text-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
        </div>
        );
    };

    const renderNotificationsDropdown = () => {
        const notifs = notifications || [];
        const unreadCount = notifs.filter(n => !n.isRead).length;

        return (
            <div className="absolute top-[calc(100%+8px)] right-[-60px] w-[320px] bg-popover border border-border rounded-[8px] shadow-none-[0_8px_32px_rgba(0,0,0,0.8)] z-[100] py-2 animate-in fade-in slide-in-from-top-2 duration-150 cursor-default">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                    <span className="text-[14px] text-foreground font-bold">
                        Notifications {unreadCount > 0 && <span className="bg-[var(--gold)] text-background text-[10px] px-1.5 py-0.5 rounded-none ml-1">{unreadCount}</span>}
                    </span>
                    <button 
                        className={`flex items-center gap-1.5 text-[12px] bg-transparent transition-colors ${unreadCount > 0 ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/50 cursor-not-allowed'}`}
                        onClick={onMarkNotificationsRead}
                        disabled={unreadCount === 0}
                    >
                        <CheckCheck size={14} />
                        <span>Mark as read</span>
                    </button>
                </div>
                <div className="flex flex-col max-h-[360px] overflow-y-auto no-scrollbar">
                    {notifs.length === 0 ? (
                        <div className="px-4 py-8 text-center text-muted-foreground/70 text-[13px]">No notifications available.</div>
                    ) : (
                        notifs.map((n, idx) => (
                            <div key={n.id} className={`px-4 py-3 border-b border-border/50 last:border-0 ${n.isRead ? 'opacity-60' : ''}`}>
                                {n.groupLabel && <span className="text-[12px] text-muted-foreground font-medium mb-2 block">{n.groupLabel}</span>}
                                <div className="flex flex-col gap-1 cursor-pointer group">
                                    <span className="text-[13px] text-foreground font-bold group-hover:text-[var(--gold)] transition-colors">{n.title}</span>
                                    <span className="text-[12px] text-muted-foreground leading-snug">{n.message}</span>
                                    <span className="text-[11px] text-muted-foreground/70 mt-1">{n.date}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    const renderGridAppsDropdown = () => (
        <div className="absolute top-[calc(100%+8px)] right-[-20px] w-[220px] bg-popover border border-border rounded-[8px] shadow-none-[0_8px_32px_rgba(0,0,0,0.8)] z-[100] py-2 animate-in fade-in slide-in-from-top-2 duration-150 cursor-default">
            <div className="flex flex-col">
                <a href="/accounts" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors group">
                    <LayoutGrid size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span className="text-[13px] text-foreground font-medium">Personal Area</span>
                </a>
                <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors group">
                    <Globe size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span className="text-[13px] text-foreground font-medium">Public website</span>
                </a>
                <a href="/partner-dashboard" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors group">
                    <Users size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span className="text-[13px] text-foreground font-medium">Partnership</span>
                </a>
            </div>
        </div>
    );

    const renderAlertsDropdown = () => (
        <div className="absolute top-[calc(100%+8px)] right-[-60px] w-[320px] bg-popover border border-border rounded-[8px] shadow-none-[0_8px_32px_rgba(0,0,0,0.8)] z-[100] animate-in fade-in slide-in-from-top-2 duration-150 cursor-default flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-[14px] text-foreground font-bold">Price alerts</span>
                <button 
                    onClick={() => {
                        openPriceAlertModal();
                        setIsAlertsOpen(false);
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                >
                    <Plus size={16} strokeWidth={2} />
                </button>
            </div>
            <div className="flex flex-col items-center justify-center p-8 gap-4 min-h-[160px]">
                <span className="text-[13px] text-muted-foreground text-center px-4">Get notified instantly about price movements</span>
                <button 
                    onClick={() => {
                        openPriceAlertModal();
                        setIsAlertsOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent text-foreground text-[13px] font-bold rounded-[4px] transition-colors border border-transparent hover:border-border"
                >
                    <Plus size={14} strokeWidth={2.5} />
                    New alert
                </button>
            </div>
        </div>
    );

    const renderInstrumentsDropdown = () => {
        const reverseCategoryMap: Record<string, string> = {
            'Favorites': 'Favorites',
            'Crypto': 'crypto',
            'Minors': 'minor',
            'Majors': 'forex',
            'Exotic': 'exotic',
            'Metals': 'commodity',
        };
        const normalizedSearchTerm = deferredInstrumentSearchTerm.trim().toLowerCase();

        const filteredInstruments = availableInstruments.filter(inst => {
            const displaySymbol = formatTerminalDisplaySymbol(inst.symbol);
            const matchesSearch =
                displaySymbol.toLowerCase().includes(normalizedSearchTerm) ||
                inst.symbol.toLowerCase().includes(normalizedSearchTerm) ||
                inst.name.toLowerCase().includes(normalizedSearchTerm);
            
            if (!matchesSearch) return false;
            
            if (deferredSelectedCategory === 'Favorites') return true; // Could hook into real favorites later
            if (deferredSelectedCategory === 'All') return true;
            
            const targetCategory = reverseCategoryMap[deferredSelectedCategory];
            if (targetCategory && inst.category === targetCategory) return true;
            if (!targetCategory) return true; // Fallback for unimplemented categories like Top Movers

            return false;
        });

        return (
        <div className="absolute top-full right-0 w-[360px] bg-card border border-border rounded-b-[6px] shadow-none-[0_12px_32px_rgba(0,0,0,0.8)] z-[100] animate-in fade-in slide-in-from-top-1 duration-150 cursor-default flex flex-col overflow-hidden max-h-[500px]">
            <div className="flex flex-col px-4 pt-4 pb-2 border-b border-border">
                <span className="text-[12px] text-muted-foreground font-bold tracking-widest uppercase mb-3">INSTRUMENTS</span>
                <div className="flex gap-2 mb-3">
                    <div className="flex-1 flex items-center bg-card border border-input rounded-[4px] px-3 h-[36px] focus-within:border-foreground transition-colors">
                        <Search size={14} className="text-muted-foreground flex-shrink-0" />
                        <input 
                            type="text" 
                            placeholder="Search" 
                            value={instrumentSearchTerm}
                            onChange={(e) => {
                                const nextValue = e.target.value;
                                startTransition(() => {
                                    setInstrumentSearchTerm(nextValue);
                                });
                            }}
                            className="bg-transparent border-none outline-none text-[13px] text-foreground w-full ml-2 placeholder:text-muted-foreground" 
                        />
                    </div>
                    
                    <div className="relative" ref={categoryMenuRef}>
                        <button onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)} className="flex items-center justify-between bg-card border border-input px-3 h-[36px] rounded-[4px] w-[140px] hover:bg-accent transition-colors group">
                            <span className="text-[14px] text-foreground">{selectedCategory}</span>
                            <ChevronDown size={14} className={`text-muted-foreground group-hover:text-foreground transition-all ${isCategoryMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isCategoryMenuOpen && (
                            <div className="absolute top-[calc(100%+8px)] right-0 w-[180px] bg-accent border border-input rounded-[8px] shadow-none-lg py-2 z-[110] animate-in fade-in slide-in-from-top-1 duration-150">
                                {['Favorites', 'Most traded', 'Top movers', 'Majors', 'Metals', 'Crypto', 'Indices', 'Stocks', 'Energy', 'Exotic', 'Minors', 'All'].map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => {
                                            startTransition(() => {
                                                setSelectedCategory(cat);
                                            });
                                            setIsCategoryMenuOpen(false);
                                        }}
                                        className={`w-full text-left px-4 py-2.5 text-[14px] font-medium hover:bg-accent hover:text-foreground transition-colors ${selectedCategory === cat ? 'text-foreground' : 'text-muted-foreground'}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar">
                <div className="grid grid-cols-[auto_1fr_2fr_auto] gap-2 px-4 py-2 border-b border-border bg-card sticky top-0 z-10 items-center">
                    <div className="w-[14px]"></div>
                    <span className="text-[11px] text-muted-foreground/70 font-medium uppercase ml-2">Symbol</span>
                    <span className="text-[11px] text-muted-foreground/70 font-medium uppercase">Description</span>
                    <div className="w-[14px]"></div>
                </div>
                {filteredInstruments.length === 0 ? (
                    <div className="flex min-h-[120px] items-center justify-center px-6 py-8 text-center text-[13px] text-muted-foreground">
                        No live instruments available yet.
                    </div>
                ) : (
                    filteredInstruments.map(inst => (
                        <HeaderInstrumentMenuRow
                            key={inst.symbol} 
                            instrument={inst}
                            onSelectTab={onSelectTab}
                            onAddPriceAlert={onAddPriceAlert}
                            onClose={() => {
                                setInstrumentSearchTerm('');
                                setIsInstrumentsOpen(false);
                            }}
                        />
                    ))
                )}
            </div>
        </div>
        );
    };

    const renderProfileDropdown = () => {
        const name = userProfile?.name || 'GUEST USER';
        const email = userProfile?.email || 'Not connected';
        const isVerified = userProfile?.isVerified ?? false;

        return (
            <div className="absolute top-[calc(100%+8px)] right-0 w-[240px] bg-popover border border-border rounded-[8px] shadow-none-[0_8px_32px_rgba(0,0,0,0.8)] z-[100] py-2 animate-in fade-in slide-in-from-top-2 duration-150 cursor-default">
                <div className="flex flex-col px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2">
                        <span className="text-[14px] text-foreground font-bold uppercase tracking-wide truncate">{name}</span>
                        {isVerified && <ShieldCheck size={14} className="text-success flex-shrink-0" />}
                    </div>
                    <span className="text-[12px] text-muted-foreground mt-0.5 truncate">{email}</span>
                </div>
                
                <div className="flex flex-col py-1">
                    <button 
                        onClick={() => {
                            onShowToast?.('info', 'Customer Support', 'Connecting you to a representative...');
                            setIsProfileMenuOpen(false);
                        }}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-accent transition-colors group"
                    >
                        <MessageCircle size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                        <span className="text-[13px] text-foreground font-medium">Support</span>
                    </button>
                    <button 
                        onClick={() => {
                            onShowToast?.('info', 'Feedback', 'Opening feature suggestion portal.');
                            setIsProfileMenuOpen(false);
                        }}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-accent transition-colors group"
                    >
                        <Lightbulb size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                        <span className="text-[13px] text-foreground font-medium">Suggest a feature</span>
                    </button>
                </div>

                <div className="h-[1px] bg-accent mx-4 my-1" />

                <div className="flex flex-col py-1">
                    <button 
                        onClick={() => {
                            void handleSignOut();
                        }}
                        disabled={isSigningOut}
                        aria-busy={isSigningOut}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-accent transition-colors group w-full text-left disabled:cursor-wait disabled:opacity-70"
                    >
                        <LogOut size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                        <span className="text-[13px] text-foreground font-medium">{isSigningOut ? 'Signing Out...' : 'Sign Out'}</span>
                    </button>
                </div>
            </div>
        );
    };

    return (
        <>
        <header
            className="flex items-center flex-shrink-0 relative z-[100] px-2 md:px-4 select-none bg-background border-b-[6px] border-border h-[64px]"
            style={{
                height: '64px',
                WebkitAppRegion: 'drag'
            } as React.CSSProperties}
        >
            <div className="flex items-center h-full w-full max-w-[100vw] justify-between">
            {/* ——— Left: Menu, Logo & Deposit ——— */}
            <div
                className="flex items-center h-full flex-shrink-0"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                {/* Mobile Menu Toggle  */}
                <button
                    onClick={() => onToggleSidebar('instruments')}
                    className="mr-1 text-muted-foreground hover:text-foreground md:hidden p-1 rounded-[4px] border border-muted hover:border-foreground hover:bg-accent transition-all"
                >
                    <Menu size={20} strokeWidth={2.5} />
                </button>

                <div className="hidden md:flex flex-col justify-center h-full pl-2 md:pl-4 pr-4 border-r border-border">
                    <div className="relative inline-flex items-center justify-center gap-2 rounded-none h-[64px] select-none group cursor-pointer">
                        <img
                            src={theme === 'dark' ? '/assets/yopips-logo-white.png' : '/assets/yopips-logo-dark.png'}
                            alt="YoPips"
                            width={154}
                            height={39}
                            className="h-[30px] md:h-[34px] w-auto max-w-[148px] object-contain opacity-95 transition-opacity hover:opacity-100"
                            style={{ maxWidth: '100%', width: 'auto' }}
                        />
                        <span className="mb-5 rounded-[3px] border border-primary/35 bg-primary/10 px-1.5 py-[1px] text-[9px] font-bold uppercase leading-none tracking-[0.08em] text-primary">
                            Beta
                        </span>
                    </div>
                </div>
            </div>

            {/* ——— Center: Tabs (Mobile Optimized) ——— */}
            <div
                className="flex items-center justify-between md:justify-start h-full flex-1 min-w-0"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                {/* Desktop Tabs (Hidden on Mobile) */}
                <div className="hidden md:flex items-center h-full flex-1 min-w-0 pl-1">
                    <div className="flex items-center h-full overflow-x-auto no-scrollbar flex-shrink-1 min-w-0 scroll-smooth pr-1">
                        {openTabs.map((symbol) => {
                            const isActive = symbol === selectedSymbol;
                            const isDragging = symbol === draggedSymbol;
                            const isDragOver = symbol === dragOverSymbol;
                            // Calculate if tabs need to shrink (simulate exness behavior when many tabs open)
                            return (
                                <div
                                    key={symbol}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, symbol)}
                                    onDragOver={(e) => handleDragOver(e, symbol)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, symbol)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => onSelectTab(symbol)}
                                    className={`
                                        relative flex items-center h-full px-4 cursor-pointer group select-none transition-all duration-200
                                        ${isActive ? 'bg-transparent text-foreground' : 'bg-transparent text-muted-foreground hover:bg-accent/50'}
                                        ${isDragging ? 'opacity-50' : 'opacity-100'}
                                        ${isDragOver ? 'border-2 border-dashed border-primary' : ''}
                                    `}
                                >
                                    {/* Bottom Line */}
                                    {isActive ? (
                                        <div className="absolute bottom-[0px] left-0 right-0 h-[3px] bg-foreground z-10" />
                                    ) : (
                                        <div className="absolute bottom-[0px] left-0 right-0 h-[2px] bg-border opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                                    )}

                                    <div className="flex items-center gap-2 lg:gap-3 overflow-hidden">
                                        {/* Flags / Icon */}
                                        <div className="flex items-center relative flex-shrink-0">
                                            <SymbolIcon symbol={symbol} />
                                        </div>

                                        <span className={`text-[13px] lg:text-[14px] font-medium leading-none whitespace-nowrap overflow-hidden text-ellipsis transition-all max-w-[160px] ${isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
                                            {formatTerminalDisplaySymbol(symbol)}
                                        </span>
                                    </div>

                                    <span
                                        onClick={(e) => { e.stopPropagation(); onCloseTab(symbol); }}
                                        className={`ml-2 p-0.5 rounded-none hover:bg-accent text-muted-foreground hover:text-foreground transition-all ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} flex-shrink-0`}
                                    >
                                        <X size={14} />
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <div ref={instrumentsRef} className="relative h-full flex items-center flex-shrink-0">
                        <button 
                            onClick={() => setIsInstrumentsOpen(!isInstrumentsOpen)} 
                            className={`h-full px-3 flex items-center justify-center transition-colors bg-transparent ${isInstrumentsOpen ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
                        >
                            <Plus size={18} className={isInstrumentsOpen ? 'rotate-45 transition-transform' : 'transition-transform'} strokeWidth={1.5} />
                        </button>
                        {isInstrumentsOpen && renderInstrumentsDropdown()}
                    </div>
                </div>

                {/* Mobile Center Layout (Symbol & Account) */}
                <div className="flex md:hidden items-center justify-center flex-1 min-w-0 w-full px-1 z-50">
                    <div className="flex items-center bg-background rounded-[4px] border border-[var(--border)] w-full max-w-[260px] h-[36px] overflow-hidden">
                        {/* Active Symbol Replica */}
                        <button className="flex items-center gap-1.5 px-2 h-full hover:bg-accent transition-colors min-w-0 flex-1 border-r border-[var(--border)]">
                            <div className="flex items-center justify-center relative flex-shrink-0 scale-90 w-5 h-5 -ml-1">
                                <SymbolIcon symbol={selectedSymbol} />
                            </div>
                            <span className="text-[13px] font-bold text-foreground truncate leading-none pt-0.5">{formatTerminalDisplaySymbol(selectedSymbol)}</span>
                        </button>

                        {/* Account Balance */}
                        <div className="relative flex-1" ref={mobileAccountMenuRef}>
                            <button
                                onClick={() => setIsMobileAccountMenuOpen(!isMobileAccountMenuOpen)}
                                className={`flex items-center px-2 h-full transition-colors justify-between w-full bg-card hover:bg-accent`}
                                data-test="account-button-mobile"
                            >
                                <div className="flex flex-col items-start justify-center flex-1 w-full ml-1">
                                    <span className={`${activeAcc.isReal ? 'text-warning' : 'text-success'} text-[9px] font-bold uppercase tracking-wider leading-none mb-0.5`}>
                                        {activeAcc.isReal ? 'Real' : 'Demo'} {renderAccountNumberLabel(activeAcc)}
                                    </span>
                                    <div className="flex items-baseline gap-1 leading-none mt-0.5">
                                        <span className={`text-[12px] font-bold text-foreground font-mono truncate transition-all ${hideBalance ? 'blur-[4px] select-none opacity-80 pointer-events-none' : ''}`}>
                                            {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                                <ChevronDown size={14} className={`text-muted-foreground flex-shrink-0 ml-1 transition-transform ${isMobileAccountMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Mobile Account Dropdown */}
                            {isMobileAccountMenuOpen && renderAccountDropdown(true)}
                        </div>
                    </div>
                </div>
            </div>
                       {/* ——— Right Section: Account & Icons ——— */}
            <div
                className="flex items-center h-full justify-end flex-shrink-0 pr-2 md:pr-4"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >

                {/* Desktop Account Info (Hidden on Mobile) */}
                <div className="hidden md:flex relative mr-5" ref={accountMenuRef}>
                    <button
                        onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                        className={`flex items-center h-full px-2 rounded-[6px] transition-colors gap-3 ${isAccountMenuOpen ? 'bg-accent' : 'bg-transparent hover:bg-accent/50'}`}
                        data-test="account-button-desktop"
                    >
                        <div className="flex flex-col items-start justify-center">
                            <div className="flex items-center gap-1.5 leading-none mb-1">
                                {activeAcc.isReal ? (
                                    <span className="bg-warning/10 text-warning text-[10px] font-bold px-[4px] py-[2px] rounded-[2px] uppercase tracking-wider">
                                        Real
                                    </span>
                                ) : (
                                    <span className="bg-success text-background text-[10px] font-bold px-[4px] py-[2px] rounded-[2px] uppercase tracking-wider">
                                        Demo
                                    </span>
                                )}
                                <span className="flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
                                    <span className="font-mono text-[11px] font-semibold text-foreground/90">{renderAccountNumberLabel(activeAcc)}</span>
                                </span>
                            </div>
                            <div className="flex items-center gap-1 leading-none mt-0.5">
                                <span className={`text-[15px] font-bold text-foreground tracking-wide transition-all ${hideBalance ? 'blur-[4px] select-none opacity-80 pointer-events-none' : ''}`}>
                                    {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                                <span className={`text-[15px] font-normal text-muted-foreground transition-all ${hideBalance ? 'blur-[4px] select-none opacity-80 pointer-events-none' : ''}`}>
                                    {activeAcc.currency || account.currency || 'USD'}
                                </span>
                                <svg className={`text-muted-foreground transition-transform duration-200 ml-1 ${isAccountMenuOpen ? 'rotate-180' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7 10l5 5 5-5z"></path>
                                </svg>
                            </div>
                        </div>
                    </button>

                    {/* Account Dropdown */}
                    {isAccountMenuOpen && renderAccountDropdown(false)}
                </div>

                {/* Header Icons - Hidden on mobile */}
                <div className="hidden md:flex items-center gap-5 relative mr-2">
                    <div ref={notificationsRef} className="relative">
                        <button
                            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                            className="flex items-center justify-center transition-colors hover:opacity-80 text-foreground"
                            title="Notifications"
                        >
                            <Bell size={22} strokeWidth={2} />
                            {(notifications || []).some(n => !n.isRead) && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-destructive"></span>
                            )}
                        </button>
                        {isNotificationsOpen && renderNotificationsDropdown()}
                    </div>

                    <div ref={alertsRef} className="relative">
                        <button
                            onClick={() => setIsAlertsOpen(!isAlertsOpen)}
                            className="flex items-center justify-center transition-colors hover:opacity-80 text-foreground"
                            title="Price Alerts"
                            data-test="alarm-btn"
                        >
                            <AlarmClock size={22} strokeWidth={2} />
                        </button>
                        {isAlertsOpen && renderAlertsDropdown()}
                    </div>

                    <div ref={gridAppsMenuRef} className="relative">
                        <button
                            onClick={() => setIsGridAppsMenuOpen(!isGridAppsMenuOpen)}
                            className="flex items-center justify-center transition-colors hover:opacity-80 text-foreground"
                            title="Apps"
                        >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="5" cy="5" r="2.2"/>
                                <circle cx="12" cy="5" r="2.2"/>
                                <circle cx="19" cy="5" r="2.2"/>
                                <circle cx="5" cy="12" r="2.2"/>
                                <circle cx="12" cy="12" r="2.2"/>
                                <circle cx="19" cy="12" r="2.2"/>
                                <circle cx="5" cy="19" r="2.2"/>
                                <circle cx="12" cy="19" r="2.2"/>
                                <circle cx="19" cy="19" r="2.2"/>
                            </svg>
                        </button>
                        {isGridAppsMenuOpen && renderGridAppsDropdown()}
                    </div>

                    <div ref={profileMenuRef} className="relative">
                        <button
                            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                            className="flex items-center justify-center transition-colors hover:opacity-80 text-foreground"
                            title="Profile"
                        >
                            <UserCircle size={22} strokeWidth={2} />
                        </button>
                        {isProfileMenuOpen && renderProfileDropdown()}
                    </div>
                </div>

                {/* Desktop Deposit Button */}
                <div className="hidden md:flex items-center h-full ml-4">
                    <button
                        onClick={() => onTopUp?.()}
                        className="h-[36px] px-8 rounded-[4px] bg-accent/40 border border-border hover:bg-accent transition-colors text-foreground text-[14px] font-medium tracking-wide"
                        data-test="deposit-button"
                    >
                        Deposit
                    </button>
                </div>

                {/* Mobile Deposit Button */}
                <div className="flex md:hidden items-center justify-center h-full px-2">
                    <button
                        onClick={() => onTopUp?.()}
                        className="h-[28px] px-4 rounded-[4px] bg-accent/40 border border-border hover:bg-accent transition-colors text-foreground text-[12px] font-medium"
                    >
                        Deposit
                    </button>
                </div>
            </div>
            </div>
        </header>

        {isPriceAlertModalOpen && (
            <PriceAlertModal
                symbol={selectedInstrument?.symbol ?? selectedSymbol}
                currentBid={selectedInstrumentPrice?.bid}
                currentAsk={selectedInstrumentPrice?.ask}
                digits={selectedInstrument?.digits}
                onClose={() => setIsPriceAlertModalOpen(false)}
                onSubmit={onAddPriceAlert}
            />
        )}

        {isLoginModalOpen && (
            <LoginModal
                onClose={() => setIsLoginModalOpen(false)}
                onSuccess={(accountId) => {
                    setIsLoginModalOpen(false);
                    if (onSwitchAccount) onSwitchAccount(accountId);
                }}
            />
        )}
        </>
    );
}

export default memo(Header);


