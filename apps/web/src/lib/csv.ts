/** Fields that would be read as a formula if the CSV is opened in a spreadsheet. */
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeField(value: string | number | null | undefined): string {
  if (value == null) return '';
  let text = String(value);
  // Set names and themes come from an external API, so neutralise anything Excel or Sheets
  // would evaluate as a formula rather than show as text.
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Rows are written in the order given; the first row is the header. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(escapeField).join(',')).join('\r\n');
}

/** Hands the CSV to the browser as a download. */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM keeps Excel from mangling non-ASCII set names.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
