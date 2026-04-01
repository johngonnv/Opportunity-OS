// PLATFORM ADMIN SEED CREDENTIALS
// Email:    admin@goldenagegovcon.com
// Password: GoldenAge2024!
//
// This user has:
//   account_type   = 'platform_user'
//   is_platform_admin = true
//   platform_role  = 'business_super_admin'

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
import * as schema from "./schema";
import { eq } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const ADMIN_EMAIL = "admin@goldenagegovcon.com";
const ADMIN_PASSWORD = "GoldenAge2024!";
const ADMIN_FIRST_NAME = "Platform";
const ADMIN_LAST_NAME = "Admin";

async function main() {
  const existing = await db.query.usersTable.findFirst({
    where: eq(schema.usersTable.email, ADMIN_EMAIL),
  });

  if (existing) {
    console.log("Platform admin user already exists, updating admin flags...");
    await db
      .update(schema.usersTable)
      .set({
        accountType: "platform_user",
        isPlatformAdmin: true,
        platformRole: "business_super_admin",
      })
      .where(eq(schema.usersTable.email, ADMIN_EMAIL));
    console.log("Platform admin flags updated.");
  } else {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await db.insert(schema.usersTable).values({
      email: ADMIN_EMAIL,
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      passwordHash,
      accountType: "platform_user",
      isPlatformAdmin: true,
      platformRole: "business_super_admin",
    });
    console.log("Platform admin user created.");
  }

  console.log(`Admin email: ${ADMIN_EMAIL}`);
  console.log("Admin seed complete.");
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
