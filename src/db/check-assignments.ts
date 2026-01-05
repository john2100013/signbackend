import pool from './connection';

async function checkAssignments() {
  console.log('🔍 Checking Document Assignments in Detail...\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Check all assignments
    console.log('📋 All Document Assignments:\n');
    const allAssignments = await pool.query(`
      SELECT 
        dr.id as assignment_id,
        dr.document_id,
        dr.recipient_id,
        dr.status,
        dr.created_at,
        d.title as document_title,
        u_owner.email as owner_email,
        u_owner.full_name as owner_name,
        u_recipient.email as recipient_email,
        u_recipient.full_name as recipient_name,
        u_recipient.role as recipient_role
      FROM document_recipients dr
      JOIN documents d ON dr.document_id = d.id
      JOIN users u_owner ON d.uploaded_by = u_owner.id
      JOIN users u_recipient ON dr.recipient_id = u_recipient.id
      ORDER BY dr.created_at DESC;
    `);

    if (allAssignments.rows.length === 0) {
      console.log('   No assignments found in database.\n');
    } else {
      console.log(`   Found ${allAssignments.rows.length} assignment(s):\n`);
      allAssignments.rows.forEach((assign, idx) => {
        console.log(`   ${idx + 1}. Assignment ID: ${assign.assignment_id}`);
        console.log(`      Document: "${assign.document_title}" (ID: ${assign.document_id})`);
        console.log(`      Owner: ${assign.owner_name} (${assign.owner_email})`);
        console.log(`      Recipient: ${assign.recipient_name} (${assign.recipient_email})`);
        console.log(`      Recipient ID: ${assign.recipient_id}`);
        console.log(`      Recipient Role: ${assign.recipient_role}`);
        console.log(`      Status: ${assign.status}`);
        console.log(`      Created: ${assign.created_at}`);
        console.log('');
      });
    }

    // Check all users
    console.log('👥 All Users in Database:\n');
    const allUsers = await pool.query(`
      SELECT 
        id,
        email,
        full_name,
        role,
        is_external,
        created_at
      FROM users
      ORDER BY id;
    `);

    console.log(`   Found ${allUsers.rows.length} user(s):\n`);
    allUsers.rows.forEach((user, idx) => {
      console.log(`   ${idx + 1}. User ID: ${user.id}`);
      console.log(`      Name: ${user.full_name}`);
      console.log(`      Email: ${user.email}`);
      console.log(`      Role: ${user.role}`);
      console.log(`      External: ${user.is_external}`);
      console.log('');
    });

    // Check what documents each user should see
    console.log('📄 Documents Visible to Each User:\n');
    for (const user of allUsers.rows) {
      if (user.role === 'management') {
        const userDocs = await pool.query(`
          SELECT id, title, status, created_at
          FROM documents
          WHERE uploaded_by = $1
          ORDER BY created_at DESC;
        `, [user.id]);
        
        console.log(`   ${user.full_name} (${user.email}) - Management User`);
        console.log(`      Own Documents: ${userDocs.rows.length}`);
        userDocs.rows.forEach(doc => {
          console.log(`         - "${doc.title}" (ID: ${doc.id}, Status: ${doc.status})`);
        });
      } else {
        const assignedDocs = await pool.query(`
          SELECT 
            d.id,
            d.title,
            d.status,
            dr.status as recipient_status,
            dr.created_at as assigned_at
          FROM document_recipients dr
          JOIN documents d ON dr.document_id = d.id
          WHERE dr.recipient_id = $1
          ORDER BY dr.created_at DESC;
        `, [user.id]);
        
        console.log(`   ${user.full_name} (${user.email}) - Recipient User (ID: ${user.id})`);
        console.log(`      Assigned Documents: ${assignedDocs.rows.length}`);
        if (assignedDocs.rows.length === 0) {
          console.log(`      ⚠️  No documents assigned to this user!`);
        } else {
          assignedDocs.rows.forEach(doc => {
            console.log(`         - "${doc.title}" (Doc ID: ${doc.id}, Status: ${doc.recipient_status})`);
          });
        }
      }
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Assignment Check Complete!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Check failed:', error);
    process.exit(1);
  }
}

checkAssignments();

