import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'easysign',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

// Log connection details (without password) for debugging
console.log('📊 Database Configuration:');
console.log(`   Host: ${dbConfig.host}`);
console.log(`   Port: ${dbConfig.port}`);
console.log(`   Database: ${dbConfig.database}`);
console.log(`   User: ${dbConfig.user}`);
console.log(`   Password: ${dbConfig.password ? '***' : 'NOT SET'}`);

const pool = new Pool(dbConfig);

// Test connection on startup
pool.query('SELECT NOW()')
  .then(() => {
    console.log('✅ Database connection successful');
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Ensure PostgreSQL is running');
    console.error('   2. Check your .env file in the backend directory');
    console.error('   3. Verify DB_PASSWORD matches your PostgreSQL password');
    console.error('   4. Ensure the database "easysign" exists');
    console.error('   5. Check if the user has proper permissions');
  });

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't exit on error, just log it
});

export default pool;

