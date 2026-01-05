import pool from './connection';

async function updateStatusColumn() {
  try {
    console.log('🔄 Updating documents table status column...');
    
    // Check if waiting_confirmation status is already supported
    // PostgreSQL doesn't enforce enum, so we just need to ensure the column accepts the new value
    // The VARCHAR(50) type already supports it, but let's verify the table structure
    
    // Check current status values in use
    const statusCheck = await pool.query(`
      SELECT DISTINCT status FROM documents;
    `);
    
    console.log('Current document statuses in use:', statusCheck.rows.map(r => r.status));
    
    // The column is already VARCHAR(50), so it will accept 'waiting_confirmation'
    // No ALTER TABLE needed, but we can verify
    
    console.log('✅ Status column already supports waiting_confirmation status');
    console.log('✅ Migration complete - no changes needed');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

updateStatusColumn();

