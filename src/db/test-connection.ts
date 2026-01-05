import pool from './connection';

async function testConnection() {
  try {
    console.log('Testing database connection...');
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database connection successful!');
    console.log('   Current time:', result.rows[0].current_time);
    console.log('   PostgreSQL version:', result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1]);
    
    // Check if database exists
    const dbCheck = await pool.query('SELECT current_database()');
    console.log('   Connected to database:', dbCheck.rows[0].current_database);
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Database connection failed!');
    console.error('Error:', error.message);
    console.error('\n💡 Troubleshooting steps:');
    console.error('   1. Ensure PostgreSQL service is running');
    console.error('   2. Check your .env file in backend directory has:');
    console.error('      DB_HOST=localhost');
    console.error('      DB_PORT=5432');
    console.error('      DB_NAME=easysign');
    console.error('      DB_USER=postgres');
    console.error('      DB_PASSWORD=Password');
    console.error('   3. Verify the password matches your PostgreSQL postgres user password');
    console.error('   4. Create the database if it doesn\'t exist:');
    console.error('      createdb easysign');
    console.error('   5. Or using psql:');
    console.error('      psql -U postgres -c "CREATE DATABASE easysign;"');
    process.exit(1);
  }
}

testConnection();

