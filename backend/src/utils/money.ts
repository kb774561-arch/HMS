import { Decimal } from "@prisma/client/runtime/library";

export function toNumber(value: Decimal | number | string | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

export function money(value: number | string): Decimal {
  return new Decimal(value);
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
