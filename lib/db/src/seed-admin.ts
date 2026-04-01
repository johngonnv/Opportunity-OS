// =============================================================================
// PLATFORM ADMIN SEED CREDENTIALS
// =============================================================================
//
// ACCOUNT 1 — Opportunity OS Internal Platform Admin
//   Email:    admin@opportunityos.com
//   Password: OppOS_Admin2024!
//   Role:     business_super_admin (platform-level)
//   Login:    /admin/login  (internal admin console)
//   Notes:    NOT a member of any client workspace. Manages the entire platform.
//
// ACCOUNT 2 — Golden Age GovCon Workspace Admin
//   Email:    admin@goldenagegovcon.com
//   Password: GoldenAge2024!
//   Role:     ADMIN in Golden Age GovCon workspace
//   Login:    / (normal client app login)
//   Notes:    client_user, is_platform_admin = false. Can manage workspace
//             settings, pipeline views, and team members within Golden Age GovCon.
//
// =============================================================================

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
import * as schema from "./schema";
import { eq, and } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const EMS_WORKSPACE_ID = "e7a4042c-9839-4faa-a1c2-b534f4ee89a8";

async function upsertPlatformAdmin() {
  const email = "admin@opportunityos.com";
  const password = "OppOS_Admin2024!";

  const existing = await db.query.usersTable.findFirst({
    where: eq(schema.usersTable.email, email),
  });

  if (existing) {
    await db
      .update(schema.usersTable)
      .set({
        accountType: "platform_user",
        isPlatformAdmin: true,
        platformRole: "business_super_admin",
      })
      .where(eq(schema.usersTable.email, email));
    console.log(`[Platform Admin] Updated existing user: ${email}`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(schema.usersTable).values({
      email,
      firstName: "Platform",
      lastName: "Admin",
      passwordHash,
      accountType: "platform_user",
      isPlatformAdmin: true,
      platformRole: "business_super_admin",
    });
    console.log(`[Platform Admin] Created: ${email}`);
  }

  // Make sure no workspace membership exists for the platform admin
  const oldAdminEntry = await db.query.usersTable.findFirst({
    where: eq(schema.usersTable.email, email),
  });
  if (oldAdminEntry) {
    await db
      .delete(schema.workspaceMembersTable)
      .where(eq(schema.workspaceMembersTable.userId, oldAdminEntry.id));
    console.log(`[Platform Admin] Ensured no workspace membership for ${email}`);
  }
}

async function upsertWorkspaceAdmin() {
  const email = "admin@goldenagegovcon.com";
  const password = "GoldenAge2024!";

  let user = await db.query.usersTable.findFirst({
    where: eq(schema.usersTable.email, email),
  });

  if (user) {
    // Ensure this account is NOT a platform admin
    await db
      .update(schema.usersTable)
      .set({
        accountType: "client_user",
        isPlatformAdmin: false,
        platformRole: null,
      })
      .where(eq(schema.usersTable.email, email));
    console.log(`[Workspace Admin] Updated existing user: ${email} (cleared platform admin flags)`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    const [inserted] = await db.insert(schema.usersTable).values({
      email,
      firstName: "Workspace",
      lastName: "Admin",
      passwordHash,
      accountType: "client_user",
      isPlatformAdmin: false,
      platformRole: null,
    }).returning();
    user = inserted;
    console.log(`[Workspace Admin] Created: ${email}`);
  }

  // Ensure workspace membership in Golden Age GovCon as ADMIN
  const existingMembership = await db.query.workspaceMembersTable.findFirst({
    where: and(
      eq(schema.workspaceMembersTable.workspaceId, EMS_WORKSPACE_ID),
      eq(schema.workspaceMembersTable.userId, user!.id),
    ),
  });

  if (existingMembership) {
    await db
      .update(schema.workspaceMembersTable)
      .set({ role: "ADMIN" })
      .where(eq(schema.workspaceMembersTable.id, existingMembership.id));
    console.log(`[Workspace Admin] Updated workspace membership to ADMIN for ${email}`);
  } else {
    await db.insert(schema.workspaceMembersTable).values({
      workspaceId: EMS_WORKSPACE_ID,
      userId: user!.id,
      role: "ADMIN",
    });
    console.log(`[Workspace Admin] Created ADMIN membership in Golden Age GovCon for ${email}`);
  }
}

async function main() {
  console.log("=== Seeding admin accounts ===\n");

  await upsertPlatformAdmin();
  await upsertWorkspaceAdmin();

  // Confirmation query
  console.log("\n=== Verification ===");
  const rows = await db.query.usersTable.findMany({
    where: (u, { inArray }) => inArray(u.email, [
      "admin@opportunityos.com",
      "admin@goldenagegovcon.com",
    ]),
    columns: {
      email: true,
      accountType: true,
      isPlatformAdmin: true,
      platformRole: true,
    },
  });
  for (const row of rows) {
    console.log(JSON.stringify(row));
  }

  console.log("\nSeed complete.");
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
