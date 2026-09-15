/**
 * One CSV body as rows of fields, quotes and doubled quotes handled, blank
 * lines dropped.
 *
 * Moved out of `football-data/fetch-season.ts` when a second source needed it:
 * six rows of the `martj42/international_results` window carry a comma inside
 * a quoted field -- a tournament called `"Morocco, Capital of African
 * Football"` -- so a `split(",")` there would shift every field after it by
 * one and read the city as the country. Two callers of thirty-five lines of
 * quote handling is one place to get it right, and a second copy would be a
 * second place to get it wrong.
 */
export function parseCsv(body: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "\"") {
      if (quoted && body[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && body[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error("unterminated quoted CSV field");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
