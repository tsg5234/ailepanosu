export const ALLOWANCE_UNIT = "₺";

export function formatAllowance(value: number, locale = "tr-TR") {
  const hasFractions = Math.abs(value % 1) > 0.001;
  const amount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: hasFractions ? 1 : 0,
    maximumFractionDigits: hasFractions ? 2 : 0
  }).format(value);

  return `${amount} ${ALLOWANCE_UNIT}`;
}
