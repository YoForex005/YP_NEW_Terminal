export const DEFAULT_PRICE_DIGITS = 5;
export const MAX_PRICE_DIGITS = 8;

export const getSafePriceDigits = (digits: unknown): number => {
    if (!Number.isInteger(digits) || (digits as number) < 0) {
        return DEFAULT_PRICE_DIGITS;
    }

    return Math.min(digits as number, MAX_PRICE_DIGITS);
};
