import { openDatabase, seedDatabase } from "../db.mjs";

const db = await openDatabase();
console.log(await seedDatabase(db, { force: process.argv.includes("--force") }));
await db.end();
