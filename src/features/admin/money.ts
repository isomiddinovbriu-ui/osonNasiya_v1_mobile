const amountUnits = ["", "ming", "million", "milliard", "trillion", "kvadrillion"];
const shortAmountUnits = ["", "ming", "mln", "mlrd", "trln", "kvdrln"];

export function formatMoneyDigits(value: string | number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function normalizeMoneyInput(value: string, previous = "") {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits && !Number.isSafeInteger(Number(digits)) ? previous : digits;
}

export function parseMoney(value: string) {
  const number = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(number) ? number : null;
}

export function formatMoneyWithUnits(value: string | number, short = false) {
  const amount = typeof value === "number" ? value : parseMoney(value);
  if (amount === null || !Number.isSafeInteger(amount) || amount < 0) return null;
  if (amount === 0) return "0 so'm";
  const parts: string[] = [];
  const units = short ? shortAmountUnits : amountUnits;
  let remaining = amount;
  let unitIndex = 0;
  while (remaining > 0) {
    const group = remaining % 1_000;
    if (group) parts.unshift(`${group}${units[unitIndex] ? ` ${units[unitIndex]}` : ""}`);
    remaining = Math.floor(remaining / 1_000);
    unitIndex += 1;
  }
  return `${parts.join(" ")} so'm`;
}
