import React from 'react';
import Image from 'next/image';
import { normalizeSymbolKey } from '@/lib/market-symbols';
import { stripExecutionSuffix } from '@/lib/trading/terminal-symbols';

interface SymbolIconProps {
    symbol: string;
    className?: string; // Optional className for sizing/positioning overrides
}

const FlagImage: React.FC<{
    code: string;
    alt: string;
    className?: string;
}> = ({ code, alt, className }) => (
    <img
        src={`https://flagcdn.com/w40/${code}.png`}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
    />
);

export const SymbolIcon: React.FC<SymbolIconProps> = ({ symbol, className }) => {
    const displaySymbol = stripExecutionSuffix(symbol).toUpperCase();
    const normalizedSymbol = normalizeSymbolKey(displaySymbol);
    const pairSymbol = displaySymbol.includes('/')
        ? displaySymbol
        : /^[A-Z]{6}$/.test(normalizedSymbol)
            ? `${normalizedSymbol.slice(0, 3)}/${normalizedSymbol.slice(3)}`
            : normalizedSymbol;

    // 1. Specific Assets (Images)
    if (normalizedSymbol === 'BTC' || normalizedSymbol === 'BTCUSD') return (
        <Image
            src="https://s2.coinmarketcap.com/static/img/coins/64x64/1.png"
            alt="BTC"
            width={22}
            height={22}
            className={`rounded-none object-contain ${className || ''}`}
        />
    );
    if (normalizedSymbol === 'AAPL') return (
        <div className={`flex h-[20px] w-[20px] items-center justify-center rounded-none border border-border bg-card shadow-none-sm ${className || ''}`}>
            <span className="text-[10px] font-black text-foreground">A</span>
        </div>
    );
    if (['USOIL', 'UKOIL', 'WTI', 'XTIUSD'].includes(normalizedSymbol)) return (
        <div className={`flex h-[22px] w-[22px] items-center justify-center rounded-none border border-[var(--border)] bg-[var(--bg-surface)] p-[3px] ${className || ''}`}>
            <Image
                src="https://cdn-icons-png.flaticon.com/512/2933/2933861.png"
                alt="Oil"
                width={16}
                height={16}
                className="h-full w-full object-contain"
            />
        </div>
    );
    if (['USTEC', 'US100', 'US30', 'US500', 'NAS100', 'SPX500'].includes(normalizedSymbol)) return (
        <div className={`relative h-[20px] w-[20px] overflow-hidden rounded-none border border-border/50 shadow-none-sm ${className || ''}`}>
            <FlagImage code="us" alt="US" className="h-full w-full object-cover" />
        </div>
    );

    // 2. Pairs (Double Flags)
    if (pairSymbol.includes('/')) {
        const [base, quote] = pairSymbol.split('/');
        const flags: Record<string, string> = {
            'EUR': 'eu', 'USD': 'us', 'GBP': 'gb', 'JPY': 'jp', 'AUD': 'au', 'NZD': 'nz', 'CAD': 'ca', 'CHF': 'ch', 'XAU': 'XAU', 'XAG': 'XAG'
        };
        const c1 = flags[base];
        const c2 = flags[quote];

        // Specific handling for metals avoids broken flag links and keeps the icon non-blank.
        if (base === 'XAU' || base === 'XAG') return (
            <div className={`relative w-[30px] h-[18px] flex items-center ${className || ''}`}>
                <div className={`absolute left-0 w-[18px] h-[18px] rounded-full overflow-hidden border border-border z-10 flex items-center justify-center ${base === 'XAU' ? 'bg-gradient-to-br from-yellow-300 to-yellow-600' : 'bg-gradient-to-br from-slate-100 to-slate-500'}`}>
                    <span className="text-[8px] font-black text-background/80">{base === 'XAU' ? 'Au' : 'Ag'}</span>
                </div>
                <div className="absolute left-[10px] w-[18px] h-[18px] rounded-full overflow-hidden border border-background z-0 bg-muted flex items-center justify-center">
                    {c2 ? (
                        <FlagImage
                            code={c2}
                            alt={quote}
                            className="h-full w-full object-cover"
                        />
                    ) : <span className="text-[7px] font-black text-muted-foreground">{quote.slice(0, 2)}</span>}
                </div>
            </div>
        );

        return (
            <div className={`relative w-[30px] h-[18px] flex items-center ${className || ''}`}>
                {/* Flag 1 */}
                <div className="absolute left-0 w-[18px] h-[18px] rounded-full overflow-hidden border-[1.5px] border-background z-10 bg-muted">
                    {c1 ? (
                        <FlagImage
                            code={c1}
                            alt={base}
                            className="h-full w-full scale-[1.3] object-cover"
                        />
                    ) : <span className="flex h-full w-full items-center justify-center text-[7px] font-black text-muted-foreground">{base.slice(0, 2)}</span>}
                </div>
                {/* Flag 2 */}
                <div className="absolute left-[12px] w-[18px] h-[18px] rounded-full overflow-hidden border-[1.5px] border-background z-0 bg-muted">
                    {c2 ? (
                        <FlagImage
                            code={c2}
                            alt={quote}
                            className="h-full w-full scale-[1.3] object-cover"
                        />
                    ) : <span className="flex h-full w-full items-center justify-center text-[7px] font-black text-muted-foreground">{quote.slice(0, 2)}</span>}
                </div>
            </div>
        );
    }

    return (
        <div className={`flex h-[18px] w-[18px] items-center justify-center rounded-full bg-muted text-[8px] font-black uppercase text-muted-foreground ${className || ''}`}>
            {normalizedSymbol.slice(0, 2) || '?'}
        </div>
    );
};

