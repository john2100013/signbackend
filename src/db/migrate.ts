import fs from 'fs';
import path from 'path';
import pool from './connection';

async function migrate() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    await pool.query(schema);
    console.log('✅ Database schema created successfully');
    
    // Create upload directories
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const dirs = [
      uploadDir,
      path.join(uploadDir, 'originals'),
      path.join(uploadDir, 'signed'),
      path.join(uploadDir, 'signatures'),
    ];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();

