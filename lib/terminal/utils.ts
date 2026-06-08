
export const getCSSVar = (name: string) => {
    if (typeof window === 'undefined') return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

export const formatPrice = (price: number, digits: number) => {
    const str = price.toFixed(digits + 1);
    const parts = str.split('.');
    if (parts.length < 2) return { base: str, large: '', small: '' };

    const base = parts[0] + '.';
    const decimal = parts[1];

    // Take the last two significant digits for "large", and the very last for "small"
    const small = decimal.slice(-1);
    const large = decimal.slice(-3, -1);
    const prefix = decimal.slice(0, -3);

    return {
        base: base + prefix,
        large: large,
        small: small
    };
};
