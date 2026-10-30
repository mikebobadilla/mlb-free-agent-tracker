/** Split one CSV line, honoring double-quoted fields ("" is an escaped quote). */
export function parseCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (line[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/** Parse CSV text with a header line. `col(name)` gives a column's index (throws if missing). */
export function parseCsv(text: string): { col: (name: string) => number; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l !== "");
  const header = parseCsvLine(lines[0] ?? "");
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`CSV is missing column "${name}"`);
    return i;
  };
  return { col, rows: lines.slice(1).map(parseCsvLine) };
}
