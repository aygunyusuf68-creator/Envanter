// Minimal CSV parser supporting comma or semicolon delimiter, quoted fields,
// escaped quotes ("") and UTF-8 BOM. Returns { headers, rows } where rows is
// array of objects keyed by header.
export function parseCSV(text) {
    if (!text) return { headers: [], rows: [] };
    // Strip BOM
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    // Detect delimiter by first non-quoted line
    const firstLine = text.split(/\r?\n/)[0] || "";
    const delim = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

    const rows = [];
    let field = "";
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
            } else {
                field += ch;
            }
        } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === delim) { row.push(field); field = ""; }
            else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
            else if (ch === "\r") { /* skip */ }
            else { field += ch; }
        }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }

    // Drop trailing empty rows
    while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
    if (!rows.length) return { headers: [], rows: [] };

    const headers = rows.shift().map((h) => h.trim());
    const objects = rows
        .filter((r) => r.some((c) => c && c.trim() !== ""))
        .map((r) => {
            const o = {};
            headers.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
            return o;
        });
    return { headers, rows: objects };
}
