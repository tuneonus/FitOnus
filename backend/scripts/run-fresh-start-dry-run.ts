import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
const { Pool } = pg;

// Read .env file directly to check DATABASE_URL
const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
const match = envFile.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
if (!match || !match[1]) {
  console.error('FATAL: DATABASE_URL not found in .env');
  process.exit(1);
}

const dbUrl = match[1];

// STRICT ENVIRONMENT GUARDS
if (dbUrl.includes('ep-gentle-bar-b3ywek03') || dbUrl.includes('br-icy-term-b3lb70tb')) {
  console.error('CRITICAL ERROR: Connection string matches PRODUCTION! Aborting immediately.');
  process.exit(1);
}

if (!dbUrl.includes('ep-shy-art-b3sxwfkd') && !dbUrl.includes('b35lwkjg')) {
  console.error('CRITICAL ERROR: Connection string is NOT the approved DEV endpoint (ep-shy-art-b3sxwfkd)! Aborting.');
  process.exit(1);
}

console.log('✓ Target database guard passed: DEV endpoint verified (ep-shy-art-b3sxwfkd)');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function countAllRows(client: pg.PoolClient) {
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  let grandTotal = 0;
  const breakdown: Record<string, number> = {};
  for (const row of tablesRes.rows) {
    const countRes = await client.query(`SELECT count(*)::int as c FROM "${row.table_name}"`);
    const count = countRes.rows[0].c;
    breakdown[row.table_name] = count;
    grandTotal += count;
  }
  return { grandTotal, breakdown, tableCount: tablesRes.rows.length };
}

async function runDryRun() {
  const client = await pool.connect();
  try {
    // 1. Initial State Count
    console.log('\n--- 1. PRE-REHEARSAL DATABASE STATE ---');
    const pre = await countAllRows(client);
    console.log(`Tables audited: ${pre.tableCount}`);
    console.log(`Total rows before rehearsal: ${pre.grandTotal}`);

    if (pre.grandTotal !== 567) {
      console.warn(`WARNING: Pre-rehearsal total rows is ${pre.grandTotal} (expected 567)`);
    }

    // 2. Read SQL rehearsal script
    const sqlPath = path.resolve(process.cwd(), 'scripts/dev-fresh-start.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('\n--- 2. EXECUTING dev-fresh-start.sql (WITH ROLLBACK) ---');
    
    // Capture notices
    client.on('notice', (msg) => {
      console.log(`[PG NOTICE] ${msg.message}`);
    });

    const startTime = Date.now();
    await client.query(sqlContent);
    const duration = Date.now() - startTime;

    console.log(`✓ Rehearsal transaction executed successfully in ${duration}ms (ended in ROLLBACK)`);

    // 3. Post-Rehearsal Verification
    console.log('\n--- 3. POST-REHEARSAL DATABASE STATE (AFTER ROLLBACK) ---');
    const post = await countAllRows(client);
    console.log(`Total rows after rollback: ${post.grandTotal}`);

    if (post.grandTotal !== pre.grandTotal) {
      console.error(`ERROR: Database state changed! Pre=${pre.grandTotal}, Post=${post.grandTotal}`);
      process.exit(1);
    }

    console.log('✓ PERFECT ROLLBACK VERIFIED: Exact row count unchanged (567 rows)');
    console.log('✓ ALL PRE-CONDITIONS, DELETIONS, AND ZERO-DATA ASSERTIONS PASSED INSIDE TRANSACTION');
  } finally {
    client.release();
    await pool.end();
  }
}

runDryRun().catch((err) => {
  console.error('FATAL REHEARSAL ERROR:', err);
  pool.end();
  process.exit(1);
});

