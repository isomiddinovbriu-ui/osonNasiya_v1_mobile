export type ContactEvent = {
  id: string;
  mijoz_id: number;
  outcome: "reached" | "no_answer";
  note: string;
  contactedAt: string;
  contactedBy: string;
  nextContactDate: string | null;
  promisedDate: string | null;
  promisedAmount: number | null;
  promiseStatus: "pending" | "fulfilled" | "broken" | null;
  paidTowardPromise: number | null;
  customer?: { name: string; phoneNumber: string; address: string | null; assignedTo: string | null } | null;
};

export type ContactListResponse = {
  contacts: ContactEvent[];
  total: number;
  page: number;
  limit: number;
};

export function validContactDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const monthNames = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

export function formatContactDay(value: string) {
  if (!validContactDate(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return `${year} yil ${day}-${monthNames[month - 1]}`;
}
