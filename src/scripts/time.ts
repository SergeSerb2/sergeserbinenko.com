const formatters = new Map<string, Intl.DateTimeFormat>();

export function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

/** "9:21 pm" in the given IANA time zone. Throws on an unknown zone. */
export function formatTimeInZone(date: Date, timeZone: string): string {
  return formatterFor(timeZone)
    .format(date)
    .replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`);
}
