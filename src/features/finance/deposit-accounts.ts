// Cuentas bancarias usadas en Grupo Getova para recibir abonos y pagos.
// El `value` se guarda en la base de datos (`order_payments.deposit_account`
// y `orders.advance_deposit_account`) y debe mantenerse estable.

export type DepositAccount = {
  value: string;
  bank: string;
  holder: string;
  last4: string;
  label: string;
};

export const DEPOSIT_ACCOUNTS: DepositAccount[] = [
  { value: "bancolombia-6342-johany",        bank: "Bancolombia", holder: "Johany",         last4: "6342", label: "Bancolombia ····6342 · Johany" },
  { value: "bancolombia-8921-luisa",         bank: "Bancolombia", holder: "Luisa",          last4: "8921", label: "Bancolombia ····8921 · Luisa" },
  { value: "bancolombia-4091-manuela",       bank: "Bancolombia", holder: "Manuela",        last4: "4091", label: "Bancolombia ····4091 · Manuela" },
  { value: "davivienda-0541-luisa",          bank: "Davivienda",  holder: "Luisa",          last4: "0541", label: "Davivienda ····0541 · Luisa" },
  { value: "davivienda-4435-manuela",        bank: "Davivienda",  holder: "Manuela",        last4: "4435", label: "Davivienda ····4435 · Manuela" },
  { value: "bancolombia-0368-martha-pineda", bank: "Bancolombia", holder: "Martha Pineda",  last4: "0368", label: "Bancolombia ····0368 · Martha Pineda" },
  { value: "bancolombia-5715-jonathan-vera", bank: "Bancolombia", holder: "Jonathan Vera",  last4: "5715", label: "Bancolombia ····5715 · Jonathan Vera" },
  { value: "efectivo",                       bank: "Efectivo",    holder: "Caja",           last4: "",     label: "Efectivo · Caja" },
  { value: "otro",                           bank: "Otro",        holder: "—",              last4: "",     label: "Otro / no aplica" },
];

const BY_VALUE = new Map(DEPOSIT_ACCOUNTS.map((a) => [a.value, a]));

export function getDepositAccount(value: string | null | undefined): DepositAccount | null {
  if (!value) return null;
  return BY_VALUE.get(value) ?? null;
}

export function formatDepositAccount(value: string | null | undefined, fallback = "—"): string {
  const acc = getDepositAccount(value);
  return acc ? acc.label : fallback;
}

/** Métodos de pago que típicamente requieren especificar cuenta destino. */
export const ACCOUNT_REQUIRED_METHODS = new Set([
  "Transferencia", "PSE", "Nequi", "Daviplata", "Tarjeta",
  "transferencia", "pse", "nequi", "daviplata", "tarjeta",
]);
