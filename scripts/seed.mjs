import { openDatabase, seedDatabase } from "../db.mjs";

const db = openDatabase();
console.log(seedDatabase(db, { force: process.argv.includes("--force") }));
db.close();
