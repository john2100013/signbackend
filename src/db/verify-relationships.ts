import pool from './connection';

async function verifyRelationships() {
  console.log('🔍 Verifying Database Relationships...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // 1. Check foreign key constraints
    console.log('1️⃣ Checking Foreign Key Constraints...');
    const constraints = await pool.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `);

    console.log(`   Found ${constraints.rows.length} foreign key constraints:\n`);
    constraints.rows.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.table_name}.${row.column_name} → ${row.foreign_table_name}.${row.foreign_column_name}`);
    });

    // 2. Check documents -> users relationship
    console.log('\n2️⃣ Checking Documents → Users Relationship...');
    const docUserCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_docs,
        COUNT(DISTINCT d.uploaded_by) as unique_owners,
        COUNT(CASE WHEN u.id IS NULL THEN 1 END) as orphaned_docs
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id;
    `);

    const docStats = docUserCheck.rows[0];
    console.log(`   Total Documents: ${docStats.total_docs}`);
    console.log(`   Unique Document Owners: ${docStats.unique_owners}`);
    console.log(`   Orphaned Documents (no valid owner): ${docStats.orphaned_docs}`);

    if (parseInt(docStats.orphaned_docs) > 0) {
      console.log('   ⚠️  WARNING: Found orphaned documents!');
      const orphaned = await pool.query(`
        SELECT d.id, d.title, d.uploaded_by
        FROM documents d
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE u.id IS NULL;
      `);
      orphaned.rows.forEach(doc => {
        console.log(`      - Document ID ${doc.id}: "${doc.title}" (owner ID ${doc.uploaded_by} not found)`);
      });
    } else {
      console.log('   ✅ All documents have valid owners');
    }

    // 3. Check document_recipients relationships
    console.log('\n3️⃣ Checking Document Recipients Relationships...');
    const recipientCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_assignments,
        COUNT(DISTINCT dr.document_id) as unique_docs,
        COUNT(DISTINCT dr.recipient_id) as unique_recipients,
        COUNT(CASE WHEN d.id IS NULL THEN 1 END) as orphaned_doc_refs,
        COUNT(CASE WHEN u.id IS NULL THEN 1 END) as orphaned_user_refs
      FROM document_recipients dr
      LEFT JOIN documents d ON dr.document_id = d.id
      LEFT JOIN users u ON dr.recipient_id = u.id;
    `);

    const recipStats = recipientCheck.rows[0];
    console.log(`   Total Assignments: ${recipStats.total_assignments}`);
    console.log(`   Unique Documents: ${recipStats.unique_docs}`);
    console.log(`   Unique Recipients: ${recipStats.unique_recipients}`);
    console.log(`   Orphaned Document References: ${recipStats.orphaned_doc_refs}`);
    console.log(`   Orphaned User References: ${recipStats.orphaned_user_refs}`);

    if (parseInt(recipStats.orphaned_doc_refs) > 0) {
      console.log('   ⚠️  WARNING: Found assignments to non-existent documents!');
      const orphaned = await pool.query(`
        SELECT dr.id, dr.document_id, dr.recipient_id
        FROM document_recipients dr
        LEFT JOIN documents d ON dr.document_id = d.id
        WHERE d.id IS NULL;
      `);
      orphaned.rows.forEach(assign => {
        console.log(`      - Assignment ID ${assign.id}: Document ${assign.document_id} not found`);
      });
    }

    if (parseInt(recipStats.orphaned_user_refs) > 0) {
      console.log('   ⚠️  WARNING: Found assignments to non-existent users!');
      const orphaned = await pool.query(`
        SELECT dr.id, dr.document_id, dr.recipient_id
        FROM document_recipients dr
        LEFT JOIN users u ON dr.recipient_id = u.id
        WHERE u.id IS NULL;
      `);
      orphaned.rows.forEach(assign => {
        console.log(`      - Assignment ID ${assign.id}: User ${assign.recipient_id} not found`);
      });
    }

    if (parseInt(recipStats.orphaned_doc_refs) === 0 && parseInt(recipStats.orphaned_user_refs) === 0) {
      console.log('   ✅ All assignments have valid document and user references');
    }

    // 4. Sample data verification
    console.log('\n4️⃣ Sample Data Verification...');
    const sampleDocs = await pool.query(`
      SELECT 
        d.id as doc_id,
        d.title,
        d.uploaded_by,
        u.email as owner_email,
        u.full_name as owner_name,
        COUNT(dr.id) as assignment_count
      FROM documents d
      JOIN users u ON d.uploaded_by = u.id
      LEFT JOIN document_recipients dr ON d.id = dr.document_id
      GROUP BY d.id, d.title, d.uploaded_by, u.email, u.full_name
      ORDER BY d.id DESC
      LIMIT 5;
    `);

    console.log(`   Sample Documents (last 5):\n`);
    sampleDocs.rows.forEach((doc, idx) => {
      console.log(`   ${idx + 1}. Document ID ${doc.doc_id}: "${doc.title}"`);
      console.log(`      Owner: ${doc.owner_name} (${doc.owner_email}) - User ID: ${doc.uploaded_by}`);
      console.log(`      Assignments: ${doc.assignment_count}`);
    });

    // 5. Check specific user assignments
    console.log('\n5️⃣ Checking User Assignments...');
    const userAssignments = await pool.query(`
      SELECT 
        u.id as user_id,
        u.email,
        u.full_name,
        COUNT(dr.id) as pending_count,
        COUNT(CASE WHEN dr.status = 'signed' THEN 1 END) as signed_count
      FROM users u
      LEFT JOIN document_recipients dr ON u.id = dr.recipient_id
      WHERE u.role = 'recipient'
      GROUP BY u.id, u.email, u.full_name
      HAVING COUNT(dr.id) > 0
      ORDER BY u.email;
    `);

    console.log(`   Recipients with assignments: ${userAssignments.rows.length}\n`);
    userAssignments.rows.forEach((user, idx) => {
      console.log(`   ${idx + 1}. ${user.full_name} (${user.email}) - ID: ${user.user_id}`);
      console.log(`      Pending: ${user.pending_count}, Signed: ${user.signed_count}`);
    });

    // 6. Verify primary keys
    console.log('\n6️⃣ Verifying Primary Keys...');
    const primaryKeys = await pool.query(`
      SELECT
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name;
    `);

    console.log(`   Primary Keys Found:\n`);
    primaryKeys.rows.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.table_name}.${row.column_name}`);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Database Relationship Verification Complete!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyRelationships();

