const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync('db/migrations/0027_user_permissions.sql', 'utf8');
pool.query(sql).then(() => { console.log('Migration 0027 applied successfully.'); pool.end(); }).catch(err => { console.error('Migration failed:', err.message); pool.end(); });
