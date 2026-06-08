export interface CurrencyMeta {
    code:     string;
    symbol:   string;
    name:     string;
    flag:     string;
    gradient: string;
}

export const currencies: Record<string, CurrencyMeta> = {
    USD: { code: "USD", symbol: "$",    name: "US Dollar",           flag: "🇺🇸", gradient: "from-green-500 to-emerald-600"  },
    EUR: { code: "EUR", symbol: "€",    name: "Euro",                flag: "🇪🇺", gradient: "from-blue-500 to-blue-600"      },
    GBP: { code: "GBP", symbol: "£",    name: "British Pound",       flag: "🇬🇧", gradient: "from-indigo-500 to-indigo-600"  },
    JPY: { code: "JPY", symbol: "¥",    name: "Japanese Yen",        flag: "🇯🇵", gradient: "from-red-500 to-red-600"        },
    CHF: { code: "CHF", symbol: "Fr",   name: "Swiss Franc",         flag: "🇨🇭", gradient: "from-red-600 to-rose-600"       },
    CAD: { code: "CAD", symbol: "C$",   name: "Canadian Dollar",     flag: "🇨🇦", gradient: "from-rose-500 to-red-500"       },
    AUD: { code: "AUD", symbol: "A$",   name: "Australian Dollar",   flag: "🇦🇺", gradient: "from-yellow-500 to-amber-600"   },
    NZD: { code: "NZD", symbol: "NZ$",  name: "New Zealand Dollar",  flag: "🇳🇿", gradient: "from-sky-500 to-sky-600"        },
    SGD: { code: "SGD", symbol: "S$",   name: "Singapore Dollar",    flag: "🇸🇬", gradient: "from-red-500 to-pink-600"       },
    HKD: { code: "HKD", symbol: "HK$",  name: "Hong Kong Dollar",    flag: "🇭🇰", gradient: "from-red-600 to-red-700"        },
    CNH: { code: "CNH", symbol: "CN¥",  name: "Chinese Yuan",        flag: "🇨🇳", gradient: "from-yellow-600 to-red-500"     },
    TRY: { code: "TRY", symbol: "₺",    name: "Turkish Lira",        flag: "🇹🇷", gradient: "from-red-500 to-rose-600"       },
    ZAR: { code: "ZAR", symbol: "R",    name: "South African Rand",  flag: "🇿🇦", gradient: "from-green-600 to-yellow-500"   },
};

export const getCurrency = (code: string): CurrencyMeta =>
    currencies[code] ?? { code, symbol: code, name: code, flag: "🌐", gradient: "from-gray-500 to-gray-600" };
