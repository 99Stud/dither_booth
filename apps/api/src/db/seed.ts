import { db } from ".";
import { printConfigTable } from "./schema";

const ditherConfiguration = db.query.printConfigTable.findFirst();
console.log(ditherConfiguration);

if (!ditherConfiguration) {
  console.log("Seeding dither configuration...");
  const result = await db.insert(printConfigTable).values({});
  console.log("Dither configuration seeded:", result);
}
