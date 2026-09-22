const MAX_AMOUNT_MINOR = 9_999_999_999_999_999n;

const PLN_AMOUNT_PATTERN = /^(?:(?:0|[1-9]\d*)(?:[,.]\d{1,2})?|(?:[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?)$/;

export function parsePlnAmount(value: string): bigint | null {
  const trimmed = value.trim();
  if (!PLN_AMOUNT_PATTERN.test(trimmed)) return null;

  const normalized = trimmed.includes(".")
    ? trimmed.replaceAll(",", "")
    : /,\d{1,2}$/.test(trimmed)
      ? trimmed.replace(",", ".")
      : trimmed.replaceAll(",", "");
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));

  return minor <= MAX_AMOUNT_MINOR ? minor : null;
}
