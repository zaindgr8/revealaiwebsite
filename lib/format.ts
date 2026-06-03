export const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
export const FULL_DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];
export const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${DAY_ABBR[d.getDay()]} ${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
}

export function fmtFullDate(iso: string) {
  const d = new Date(iso);
  return `${DAY_ABBR[d.getDay()]}, ${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

export function todayPretty() {
  const d = new Date();
  return `${FULL_DAYS[d.getDay()]}, ${d.getDate()} ${FULL_MONTHS[d.getMonth()]}`;
}
