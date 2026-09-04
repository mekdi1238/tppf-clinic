/**
 * Diagnostic helper to test PostgreSQL connection and provide clear actionable instructions.
 */
require('dotenv').config();
const { Pool } = require('pg');

async function testConnection() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('\n[ERROR] DATABASE_URL is not set in your .env file!');
    process.exit(1);
  }

  console.log(`Connecting to PostgreSQL at: ${dbUrl.replace(/:([^:@]+)@/, ':****@')}`);
  const pool = new Pool({ connectionString: dbUrl });

  try {
    const res = await pool.query('SELECT current_database(), current_user;');
    console.log(`\n✓ Connected successfully! Database: "${res.rows[0].current_database}", User: "${res.rows[0].current_user}"`);
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('\n---------------------------------------------------------');
    console.error(`[DATABASE CONNECTION ERROR] Code: ${err.code || 'UNKNOWN'}`);
    console.error(`Message: ${err.message}`);
    console.error('---------------------------------------------------------');

    if (err.code === '28P01') {
      console.log('\n--> EXPLANATION: PostgreSQL Password Authentication Failed (Error 28P01)');
      console.log('    The username or password in your .env file does not match PostgreSQL on this PC.\n');
      console.log('HOW TO FIX:');
      console.log('Option A (Update .env with your PostgreSQL superuser password):');
      console.log('  1. Open the file ".env" in a text editor.');
      console.log('  2. Change DATABASE_URL to use your postgres password:');
      console.log('     DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/tppf_clinic_dev\n');
      console.log('Option B (Create the tppf_dev user and database in PostgreSQL):');
      console.log('  Run the following commands in SQL shell (psql) or pgAdmin:');
      console.log("     CREATE USER tppf_dev WITH PASSWORD 'tppf_dev_pw';");
      console.log('     CREATE DATABASE tppf_clinic_dev OWNER tppf_dev;');
      console.log('     GRANT ALL PRIVILEGES ON DATABASE tppf_clinic_dev TO tppf_dev;');
    } else if (err.code === '3D000') {
      console.log('\n--> EXPLANATION: Database does not exist (Error 3D000)');
      console.log('    The user authenticated OK, but the database "tppf_clinic_dev" has not been created yet.\n');
      console.log('HOW TO FIX:');
      console.log('  Open SQL shell (psql) or pgAdmin and run:');
      console.log('     CREATE DATABASE tppf_clinic_dev;');
    } else if (err.code === 'ECONNREFUSED') {
      console.log('\n--> EXPLANATION: PostgreSQL Server is not running or listening on port 5432');
      console.log('HOW TO FIX:');
      console.log('  1. Start the PostgreSQL service in Windows Services (services.msc).');
      console.log('  2. Make sure PostgreSQL is installed and listening on port 5432.');
    }
    console.log('---------------------------------------------------------\n');
    await pool.end();
    process.exit(1);
  }
}

testConnection();
