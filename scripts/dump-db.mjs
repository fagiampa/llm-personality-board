import initSqlJs from "sql.js";
import { readFile } from "node:fs/promises";

const DB_PATH = process.argv[2] ?? "data/psychochat.sqlite";

const SQL = await initSqlJs();
const db = new SQL.Database(await readFile(DB_PATH));

function printTable(name) {
  const res = db.exec(`SELECT * FROM ${name}`);
  console.log(`\n=== ${name} (${res[0]?.values.length ?? 0} rows) ===`);
  if (!res.length) return;
  const { columns, values } = res[0];
  console.log(columns.join(" | "));
  for (const row of values) {
    console.log(row.map((v) => (typeof v === "string" && v.length > 60 ? v.slice(0, 60) + "…" : v)).join(" | "));
  }
}

printTable("assessments");
printTable("assessment_item_repeats");

db.close();
