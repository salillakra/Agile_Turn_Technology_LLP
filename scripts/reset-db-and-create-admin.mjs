import pg from "pg";
import bcrypt from "bcrypt";

const dbUrl =
  process.env.DATABASE_URL ||
  "postgresql://atsuser:ZUlkbxyTxXvPVFJgbleR05nLUny9vI2xc7EqA70iqnsptoRarq0CWGqhF20Uo032@129.121.129.133:5432/atsdb?sslmode=disable";

console.log("Connecting to PostgreSQL at 129.121.129.133:5432...");
const client = new pg.Client({
  connectionString: dbUrl,
});

async function main() {
  await client.connect();
  console.log("Connected successfully!");

  console.log("Wiping all data from all tables in public schema...");
  
  // Truncate all tables in public schema
  await client.query(`
    DO $$ DECLARE
        r RECORD;
    BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations') LOOP
            EXECUTE 'TRUNCATE TABLE "public".' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
    END $$;
  `);

  console.log("All data wiped!");

  console.log("Creating Admin User...");
  const hashedPassword = await bcrypt.hash("1Lakra@cloud", 10);
  const email = "salillakra.dev@gmail.com";
  const name = "Salil Lakra";

  const res = await client.query(
    `
    INSERT INTO "users" (id, name, email, password, role, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, $1, $2, $3, 'ADMIN'::"Role", NOW(), NOW())
    RETURNING id, name, email, role, "createdAt";
    `,
    [name, email, hashedPassword]
  );

  console.log("\n==================================================");
  console.log("✅ DATABASE WIPED & ADMIN USER CREATED SUCCESSFULLY!");
  console.log("==================================================");
  console.log("Admin Details:");
  console.log(` - Email:    ${res.rows[0].email}`);
  console.log(` - Role:     ${res.rows[0].role}`);
  console.log(` - ID:       ${res.rows[0].id}`);
  console.log(` - Created:  ${res.rows[0].createdAt}`);
  console.log("==================================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Error resetting database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
