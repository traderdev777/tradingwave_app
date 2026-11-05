// npm run make-admin -- you@example.com
// Promotes an existing account to ADMIN.
import { PrismaClient } from "@prisma/client";

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run make-admin -- you@example.com");
  process.exit(1);
}
const db = new PrismaClient();
try {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No account found for ${email}. Sign up first at http://localhost:3000/signup`);
    process.exit(1);
  }
  await db.user.update({ where: { email }, data: { role: "ADMIN" } });
  console.log(`✔ ${email} is now an ADMIN. Refresh the app to see the Admin section.`);
} finally {
  await db.$disconnect();
}
