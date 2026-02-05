import holidays2026 from "@/app/data/holidays/2026.json";

type Holiday = {
  uid: string;
  summary: string;
  categories: string[];
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (often next day; treat as exclusive)
};

function toLocalDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

// Build a set of all Mercantile holiday dates in 2026
const mercantileDates = (() => {
  const set = new Set<string>();

  (holidays2026 as Holiday[]).forEach((h) => {
    if (!h.categories?.includes("Mercantile")) return;

    const start = toLocalDate(h.start);
    const end = toLocalDate(h.end);

    // Treat end as exclusive: include all dates in [start, end)
    for (let d = start; d < end; d = addDays(d, 1)) {
      set.add(formatYMD(d));
    }
  });

  return set;
})();

export function isWeekend(ymd: string) {
  const d = toLocalDate(ymd);
  const day = d.getDay(); // 0 Sun, 6 Sat
  return day === 0 || day === 6;
}

export function isMercantileHoliday(ymd: string) {
  return mercantileDates.has(ymd);
}

export function isNonWorkingDay(ymd: string) {
  return isWeekend(ymd) || isMercantileHoliday(ymd);
}
