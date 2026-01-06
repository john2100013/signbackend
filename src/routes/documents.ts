import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../db/connection';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { convertWordToPDF, isWordDocument, isPDF } from '../services/documentProcessor';
import { sendDocumentAssignmentEmail, sendDocumentForwardEmail, sendDocumentBackEmail } from '../services/email';
import { generateRandomPassword, hashPassword } from '../utils/password';

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'originals');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf' || ext === '.doc' || ext === '.docx') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Word documents are allowed'));
    }
  },
});

// Upload document
router.post(
  '/upload',
  authenticate,
  requireRole(['management']),
  upload.single('document'),
  auditLog('uploaded'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const { title } = req.body;
      const userId = req.user!.userId;
      
      let filePath = req.file.path;
      let fileType: 'pdf' | 'word' = 'pdf';
      
      // Convert Word to PDF if needed
      if (isWordDocument(req.file.originalname)) {
        fileType = 'word';
        const pdfPath = filePath.replace(path.extname(filePath), '.pdf');
        await convertWordToPDF(filePath, pdfPath);
        filePath = pdfPath;
      }
      
      const result = await pool.query(
        `INSERT INTO documents (title, original_filename, original_file_path, file_type, uploaded_by, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [title || req.file.originalname, req.file.originalname, filePath, fileType, userId, 'draft']
      );
      
      res.status(201).json({ document: result.rows[0] });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  }
);

// Get all documents (management - only their own documents)
router.get(
  '/',
  authenticate,
  requireRole(['management']),
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const result = await pool.query(
        `SELECT d.*, u.full_name as uploaded_by_name
         FROM documents d
         JOIN users u ON d.uploaded_by = u.id
         WHERE d.uploaded_by = $1
         ORDER BY d.created_at DESC`,
        [userId]
      );
      
      res.json({ documents: result.rows });
    } catch (error) {
      console.error('Get documents error:', error);
      res.status(500).json({ error: 'Failed to get documents' });
    }
  }
);

// Get documents assigned to sign (for recipients)
router.get(
  '/assigned-to-sign',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      
      const result = await pool.query(
        `SELECT 
          d.*, 
          dr.status as recipient_status, 
          dr.due_date, 
          dr.signed_at,
          u.full_name as uploaded_by_name,
          dr.created_at as assigned_at
         FROM document_recipients dr
         JOIN documents d ON dr.document_id = d.id
         JOIN users u ON d.uploaded_by = u.id
         WHERE dr.recipient_id = $1 AND dr.status IN ('pending', 'draft')
         ORDER BY dr.created_at DESC`,
        [userId]
      );
      
      res.json({ documents: result.rows });
    } catch (error) {
      console.error('Get assigned to sign error:', error);
      res.status(500).json({ error: 'Failed to get assigned documents' });
    }
  }
);

// Get documents waiting for confirmation (for management - documents signed by recipients)
router.get(
  '/waiting-confirmation',
  authenticate,
  requireRole(['management']),
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      
      const result = await pool.query(
        `SELECT 
          d.*,
          dr.status as recipient_status,
          dr.signed_at,
          u.full_name as signer_name,
          u.email as signer_email,
          dr.recipient_id as signer_id
         FROM documents d
         JOIN document_recipients dr ON d.id = dr.document_id
         JOIN users u ON dr.recipient_id = u.id
         WHERE d.uploaded_by = $1 
           AND dr.status = 'signed'
           AND d.status IN ('signed', 'waiting_confirmation')
         ORDER BY dr.signed_at DESC`,
        [userId]
      );
      
      res.json({ documents: result.rows });
    } catch (error) {
      console.error('Get waiting confirmation error:', error);
      res.status(500).json({ error: 'Failed to get documents waiting for confirmation' });
    }
  }
);

// Confirm signed document (management approves signed document)
router.post(
  '/:id/confirm',
  authenticate,
  requireRole(['management']),
  auditLog('confirmed'),
  async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.userId;
      
      // Verify document belongs to this user
      const docResult = await pool.query(
        'SELECT * FROM documents WHERE id = $1 AND uploaded_by = $2',
        [documentId, userId]
      );
      
      if (docResult.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }
      
      // Update document status to completed
      await pool.query(
        'UPDATE documents SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['completed', documentId]
      );
      
      res.json({ message: 'Document confirmed and marked as completed' });
    } catch (error) {
      console.error('Confirm document error:', error);
      res.status(500).json({ error: 'Failed to confirm document' });
    }
  }
);

// Get document by ID (with access control)
router.get(
  '/:id',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.userId;
      const userRole = req.user!.role;
      
      console.log(`\n📄 GET /documents/${documentId} - User: ${userId} (${userRole})`);
      
      // First check if document exists
      const docCheck = await pool.query('SELECT id, uploaded_by FROM documents WHERE id = $1', [documentId]);
      if (docCheck.rows.length === 0) {
        console.log(`❌ Document ${documentId} does not exist`);
        return res.status(404).json({ error: 'Document not found' });
      }
      
      const docOwner = docCheck.rows[0].uploaded_by;
      console.log(`   Document owner: ${docOwner}`);
      
      // Check if user is owner
      if (docOwner === userId) {
        console.log(`✅ User ${userId} is the owner`);
        const result = await pool.query(
          `SELECT d.*, u.full_name as uploaded_by_name
           FROM documents d
           JOIN users u ON d.uploaded_by = u.id
           WHERE d.id = $1`,
          [documentId]
        );
        return res.json({ document: result.rows[0] });
      }
      
      // Check if user is assigned as recipient
      const assignmentCheck = await pool.query(
        `SELECT dr.* FROM document_recipients dr 
         WHERE dr.document_id = $1 AND dr.recipient_id = $2`,
        [documentId, userId]
      );
      
      console.log(`   Assignment check: ${assignmentCheck.rows.length} assignments found`);
      
      if (assignmentCheck.rows.length > 0) {
        console.log(`✅ User ${userId} is assigned as recipient`);
        const result = await pool.query(
          `SELECT d.*, u.full_name as uploaded_by_name, 
                  dr.status as recipient_status, dr.due_date, dr.signed_at, dr.revision_note
           FROM documents d
           JOIN users u ON d.uploaded_by = u.id
           JOIN document_recipients dr ON d.id = dr.document_id
           WHERE d.id = $1 AND dr.recipient_id = $2`,
          [documentId, userId]
        );
        return res.json({ document: result.rows[0] });
      }
      
      console.log(`❌ User ${userId} has no access to document ${documentId}`);
      console.log(`   Not owner (${docOwner}) and not assigned as recipient`);
      return res.status(404).json({ error: 'Document not found or access denied' });
    } catch (error) {
      console.error('Get document error:', error);
      res.status(500).json({ error: 'Failed to get document' });
    }
  }
);

// Assign document to recipients
router.post(
  '/:id/assign',
  authenticate,
  requireRole(['management']),
  auditLog('assigned'),
  async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      let { recipient_emails, due_date } = req.body;
      
      // Handle both array and comma-separated string
      if (typeof recipient_emails === 'string') {
        recipient_emails = recipient_emails.split(',').map((e: string) => e.trim()).filter((e: string) => e);
      }
      
      if (!recipient_emails || !Array.isArray(recipient_emails) || recipient_emails.length === 0) {
        return res.status(400).json({ error: 'Recipient emails are required' });
      }
      
      // Get document
      const docResult = await pool.query('SELECT * FROM documents WHERE id = $1', [documentId]);
      if (docResult.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      
      const document = docResult.rows[0];
      
      // Update document status to 'sent_for_signing' when assigned
      await pool.query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        ['sent_for_signing', documentId]
      );
      
      const assignedRecipients = [];
      
      for (const email of recipient_emails) {
        // Normalize email
        const normalizedEmail = email.toLowerCase().trim();
        console.log(`\n📧 Processing assignment for: ${normalizedEmail}`);
        
        // Check if user exists
        let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
        let userId;
        
        if (userResult.rows.length === 0) {
          // Create external user
          const tempPassword = generateRandomPassword();
          const passwordHash = await hashPassword(tempPassword);
          
          const newUserResult = await pool.query(
            `INSERT INTO users (email, password_hash, full_name, role, is_external, must_change_password)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [normalizedEmail, passwordHash, normalizedEmail.split('@')[0], 'recipient', true, true]
          );
          
          userId = newUserResult.rows[0].id;
          console.log(`✅ Created new user: ${normalizedEmail} (ID: ${userId})`);
          
          // Send email with password
          await sendDocumentAssignmentEmail(normalizedEmail, normalizedEmail.split('@')[0], document.title, documentId, tempPassword);
        } else {
          userId = userResult.rows[0].id;
          const existingUser = userResult.rows[0];
          console.log(`✅ Found existing user: ${normalizedEmail} (ID: ${userId}, Name: ${existingUser.full_name}, Role: ${existingUser.role})`);
          
          // If user is management but being assigned a document, they should be able to receive it
          // The role doesn't prevent assignment, but dashboard queries might filter by role
          // We'll keep the assignment but log a warning
          if (existingUser.role === 'management') {
            console.log(`   ⚠️  Note: User has role 'management' but is being assigned a document.`);
            console.log(`   They can access it via /documents/assigned/me but may not see it in recipient dashboard.`);
          }
          
          // Send email notification to existing user
          try {
            await sendDocumentAssignmentEmail(normalizedEmail, existingUser.full_name, document.title, documentId);
          } catch (emailError) {
            console.error('Email notification failed for existing user:', emailError);
            // Continue even if email fails
          }
        }
        
        // Create or update assignment
        const assignResult = await pool.query(
          `INSERT INTO document_recipients (document_id, recipient_id, due_date, status)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (document_id, recipient_id) DO UPDATE SET due_date = $3, status = $4, updated_at = CURRENT_TIMESTAMP
           RETURNING *`,
          [documentId, userId, due_date || null, 'pending']
        );
        
        console.log(`✅ Assigned document ${documentId} ("${document.title}") to user ${userId} (${normalizedEmail})`);
        console.log(`   Assignment Status: ${assignResult.rows[0].status}`);
        console.log(`   Assignment ID: ${assignResult.rows[0].id}`);
        console.log(`   Recipient ID in assignment: ${assignResult.rows[0].recipient_id}`);
        
        assignedRecipients.push({ email: normalizedEmail, userId });
      }
      
      console.log(`\n✅ Total assignments completed: ${assignedRecipients.length}`);
      console.log(`📋 Assignment summary:`, assignedRecipients.map(r => ({ email: r.email, userId: r.userId })));
      console.log('');
      
      res.json({ message: 'Document assigned successfully', recipients: assignedRecipients });
    } catch (error) {
      console.error('Assign document error:', error);
      res.status(500).json({ error: 'Failed to assign document' });
    }
  }
);

// Get documents assigned to current user
router.get(
  '/assigned/me',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      
      const result = await pool.query(
        `SELECT d.*, dr.status as recipient_status, dr.due_date, dr.signed_at,
                u.full_name as uploaded_by_name, dr.created_at as assigned_at
         FROM documents d
         JOIN document_recipients dr ON d.id = dr.document_id
         JOIN users u ON d.uploaded_by = u.id
         WHERE dr.recipient_id = $1
         ORDER BY dr.created_at DESC`,
        [userId]
      );
      
      console.log(`📋 Found ${result.rows.length} documents assigned to user ${userId}`);
      if (result.rows.length > 0) {
        console.log('Documents:', result.rows.map(d => ({ id: d.id, title: d.title, status: d.recipient_status })));
      }
      
      res.json({ documents: result.rows });
    } catch (error) {
      console.error('Get assigned documents error:', error);
      res.status(500).json({ error: 'Failed to get assigned documents' });
    }
  }
);

// Download document
router.get(
  '/:id/download',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.userId;
      const userRole = req.user!.role;

      console.log('\n📥 Incoming download request:', {
        documentId,
        userId,
        userRole,
      });

      // First check basic document existence and owner
      const docCheck = await pool.query(
        'SELECT * FROM documents WHERE id = $1',
        [documentId]
      );

      if (docCheck.rows.length === 0) {
        console.error(`❌ Document ${documentId} does not exist`);
        return res.status(404).json({ error: 'Document not found' });
      }

      const document = docCheck.rows[0];
      const docOwner = document.uploaded_by;
      console.log(`   Document owner: ${docOwner}`);

      // Allow access if user is owner (management uploading the doc)
      if (docOwner === userId) {
        console.log(`✅ User ${userId} is the owner, download allowed`);
      } else {
        // Otherwise require that the user is an assigned recipient,
        // regardless of their role (management or recipient).
        const assignmentCheck = await pool.query(
          `SELECT dr.* FROM document_recipients dr 
           WHERE dr.document_id = $1 AND dr.recipient_id = $2`,
          [documentId, userId]
        );

        console.log(
          `   Assignment check for download: ${assignmentCheck.rows.length} assignments found`
        );

        if (assignmentCheck.rows.length === 0) {
          console.error(
            `❌ User ${userId} has no access to document ${documentId} for download`
          );
          return res
            .status(404)
            .json({ error: 'Document not found or access denied' });
        }

        console.log(
          `✅ User ${userId} is assigned as recipient, download allowed`
        );
      }
      
      const filePath = document.signed_file_path || document.original_file_path;
      
      console.log(`📄 Download request for document ${documentId}:`);
      console.log(`   DB file path: ${filePath}`);
      console.log(`   File type: ${document.file_type}`);
      console.log(`   Original filename: ${document.original_filename}`);
      
      // Resolve absolute path in a way that is independent of the current working directory.
      // Files are stored under UPLOAD_DIR (default "./uploads") relative to the backend root.
      // When we store paths like "uploads/originals/xxx.pdf" in the DB, we need to resolve
      // them relative to the backend directory, not the process.cwd().
      const backendRoot = path.resolve(__dirname, '..', '..'); // .../signbackend
      console.log(`   __dirname: ${__dirname}`);
      console.log(`   Backend root (resolved from __dirname): ${backendRoot}`);

      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(backendRoot, filePath);

      console.log(`   Resolved absolute path: ${absolutePath}`);
      
      if (!fs.existsSync(absolutePath)) {
        console.error(`❌ File not found at path: ${absolutePath}`);
        console.error(`   Original path from DB: ${filePath}`);
        return res.status(404).json({ error: `File not found: ${absolutePath}` });
      }
      
      // Check file size
      const stats = fs.statSync(absolutePath);
      console.log(`   File size: ${stats.size} bytes`);
      
      if (stats.size === 0) {
        console.error(`❌ File is empty: ${absolutePath}`);
        return res.status(404).json({ error: 'File is empty' });
      }
      
      // Set proper headers for PDF viewing/streaming
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${document.original_filename}"`);
      res.setHeader('Content-Length', stats.size.toString());
      res.setHeader('Accept-Ranges', 'bytes');
      
      // Stream the file instead of buffering it all at once.
      // This works well with Axios `responseType: "blob"` on the frontend
      // and avoids memory issues with large PDFs.
      const fileStream = fs.createReadStream(absolutePath);

      fileStream.on('open', () => {
        console.log(`📄 Streaming file to client: ${absolutePath}`);
        fileStream.pipe(res);
      });

      fileStream.on('error', (err) => {
        console.error('❌ Error reading file stream:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream file' });
        } else {
          res.end();
        }
      });
    } catch (error) {
      console.error('Download error:', error);
      res.status(500).json({ error: 'Failed to download document' });
    }
  }
);

// Forward document to other users
router.post(
  '/:id/forward',
  authenticate,
  requireRole(['management']),
  auditLog('forwarded'),
  async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.userId;
      const { userIds, ccEmails, externalEmails } = req.body;

      // Validate input
      if ((!userIds || userIds.length === 0) && (!externalEmails || externalEmails.length === 0)) {
        return res.status(400).json({ error: 'At least one recipient is required' });
      }

      // Verify document belongs to this user
      const docResult = await pool.query(
        'SELECT * FROM documents WHERE id = $1 AND uploaded_by = $2',
        [documentId, userId]
      );

      if (docResult.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }

      const document = docResult.rows[0];
      const filePath = document.signed_file_path || document.original_file_path;
      const backendRoot = path.resolve(__dirname, '..', '..');
      const absoluteFilePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(backendRoot, filePath);

      if (!fs.existsSync(absoluteFilePath)) {
        return res.status(404).json({ error: 'Document file not found' });
      }

      // Get sender info
      const senderResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      if (senderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Sender not found' });
      }
      const sender = senderResult.rows[0];
      const results = [];

      // Forward to users with accounts
      if (userIds && userIds.length > 0) {
        for (const recipientId of userIds) {
          try {
            const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [recipientId]);
            if (userResult.rows.length > 0) {
              const recipient = userResult.rows[0];
              
              // Send email notification
              await sendDocumentForwardEmail(
                recipient.email,
                recipient.full_name,
                sender.full_name,
                document.title,
                documentId,
                absoluteFilePath,
                document.original_filename,
                false
              );

              results.push({ userId: recipientId, email: recipient.email, success: true });
            }
          } catch (error) {
            console.error(`Failed to forward to user ${recipientId}:`, error);
            results.push({ userId: recipientId, success: false, error: String(error) });
          }
        }
      }

      // Forward to CC emails (users with accounts)
      if (ccEmails && ccEmails.length > 0) {
        for (const email of ccEmails) {
          try {
            const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
            if (userResult.rows.length > 0) {
              const recipient = userResult.rows[0];
              
              await sendDocumentForwardEmail(
                recipient.email,
                recipient.full_name,
                sender.full_name,
                document.title,
                documentId,
                absoluteFilePath,
                document.original_filename,
                false
              );

              results.push({ email, success: true, type: 'cc' });
            } else {
              // If user doesn't exist, send as external
              await sendDocumentForwardEmail(
                email,
                email.split('@')[0],
                sender.full_name,
                document.title,
                documentId,
                absoluteFilePath,
                document.original_filename,
                true
              );

              results.push({ email, success: true, type: 'cc-external' });
            }
          } catch (error) {
            console.error(`Failed to forward to CC ${email}:`, error);
            results.push({ email, success: false, type: 'cc', error: String(error) });
          }
        }
      }

      // Forward to external emails (users without accounts)
      if (externalEmails && externalEmails.length > 0) {
        for (const email of externalEmails) {
          try {
            await sendDocumentForwardEmail(
              email,
              email.split('@')[0],
              sender.full_name,
              document.title,
              documentId,
              absoluteFilePath,
              document.original_filename,
              true
            );

            results.push({ email, success: true, type: 'external' });
          } catch (error) {
            console.error(`Failed to forward to external ${email}:`, error);
            results.push({ email, success: false, type: 'external', error: String(error) });
          }
        }
      }

      res.json({
        message: 'Document forwarded successfully',
        results,
      });
    } catch (error) {
      console.error('Forward document error:', error);
      res.status(500).json({ error: 'Failed to forward document' });
    }
  }
);

// Send document back to signer
router.post(
  '/:id/send-back',
  authenticate,
  requireRole(['management']),
  auditLog('sent_back'),
  async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = req.user!.userId;
      const { note } = req.body;

      if (!note || !note.trim()) {
        return res.status(400).json({ error: 'Note is required' });
      }

      // Verify document belongs to this user
      const docResult = await pool.query(
        'SELECT * FROM documents WHERE id = $1 AND uploaded_by = $2',
        [documentId, userId]
      );

      if (docResult.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }

      const document = docResult.rows[0];

      // Get the signer (recipient who signed)
      const signerResult = await pool.query(
        `SELECT u.*, dr.status 
         FROM document_recipients dr
         JOIN users u ON dr.recipient_id = u.id
         WHERE dr.document_id = $1 AND dr.status = 'signed'
         ORDER BY dr.signed_at DESC
         LIMIT 1`,
        [documentId]
      );

      if (signerResult.rows.length === 0) {
        return res.status(404).json({ error: 'No signer found for this document' });
      }

      const signer = signerResult.rows[0];
      
      // Get sender info
      const senderResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      if (senderResult.rows.length === 0) {
        return res.status(404).json({ error: 'Sender not found' });
      }
      const sender = senderResult.rows[0];

      // Reset recipient status to sent_back_for_signing and store the note
      await pool.query(
        `UPDATE document_recipients 
         SET status = 'sent_back_for_signing', signed_at = NULL, revision_note = $3, updated_at = CURRENT_TIMESTAMP
         WHERE document_id = $1 AND recipient_id = $2`,
        [documentId, signer.id, note.trim()]
      );

      // Update document status
      await pool.query(
        'UPDATE documents SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['sent_back_for_signing', documentId]
      );

      // Send email notification
      await sendDocumentBackEmail(
        signer.email,
        signer.full_name,
        sender.full_name,
        document.title,
        note,
        documentId
      );

      res.json({ message: 'Document sent back to signer successfully' });
    } catch (error) {
      console.error('Send back document error:', error);
      res.status(500).json({ error: 'Failed to send document back' });
    }
  }
);

// Get documents sent back for signing
// For recipients: documents sent back to them
// For management: documents they sent back to recipients
router.get(
  '/sent-back-for-signing',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const userRole = req.user!.role;
      
      // Check if revision_note column exists
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'document_recipients' 
        AND column_name = 'revision_note'
      `);
      const hasRevisionNote = columnCheck.rows.length > 0;

      if (userRole === 'management') {
        // For management: Get documents they sent back
        const revisionNoteSelect = hasRevisionNote ? 'dr.revision_note,' : 'NULL as revision_note,';
        const result = await pool.query(
          `SELECT 
            d.*,
            dr.status as recipient_status,
            ${revisionNoteSelect}
            dr.updated_at as sent_back_at,
            u.full_name as recipient_name,
            u.email as recipient_email,
            dr.recipient_id
           FROM documents d
           JOIN document_recipients dr ON d.id = dr.document_id
           JOIN users u ON dr.recipient_id = u.id
           WHERE d.uploaded_by = $1 
             AND dr.status = 'sent_back_for_signing'
             AND d.status = 'sent_back_for_signing'
           ORDER BY dr.updated_at DESC`,
          [userId]
        );
        
        res.json({ documents: result.rows });
      } else {
        // For recipients: Get documents sent back to them
        const revisionNoteSelect = hasRevisionNote ? 'dr.revision_note,' : 'NULL as revision_note,';
        const result = await pool.query(
          `SELECT 
            d.*,
            dr.status as recipient_status,
            ${revisionNoteSelect}
            dr.updated_at as sent_back_at,
            u.full_name as sender_name,
            u.email as sender_email
           FROM documents d
           JOIN document_recipients dr ON d.id = dr.document_id
           JOIN users u ON d.uploaded_by = u.id
           WHERE dr.recipient_id = $1 
             AND dr.status = 'sent_back_for_signing'
             AND d.status = 'sent_back_for_signing'
           ORDER BY dr.updated_at DESC`,
          [userId]
        );
        
        res.json({ documents: result.rows });
      }
    } catch (error: any) {
      console.error('Get sent back for signing error:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        stack: error.stack
      });
      res.status(500).json({ 
        error: 'Failed to get documents sent back for signing',
        details: error.message 
      });
    }
  }
);

// Get documents sent back to me (for management users who are also recipients)
router.get(
  '/sent-back-to-me',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      
      // Check if revision_note column exists
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'document_recipients' 
        AND column_name = 'revision_note'
      `);
      const hasRevisionNote = columnCheck.rows.length > 0;

      // Get documents where user is a recipient (not the owner) and status is sent_back_for_signing
      const revisionNoteSelect = hasRevisionNote ? 'dr.revision_note,' : 'NULL as revision_note,';
      const result = await pool.query(
        `SELECT 
          d.*,
          dr.status as recipient_status,
          ${revisionNoteSelect}
          dr.updated_at as sent_back_at,
          u.full_name as sender_name,
          u.email as sender_email
         FROM documents d
         JOIN document_recipients dr ON d.id = dr.document_id
         JOIN users u ON d.uploaded_by = u.id
         WHERE dr.recipient_id = $1 
           AND d.uploaded_by != $1
           AND dr.status = 'sent_back_for_signing'
           AND d.status = 'sent_back_for_signing'
         ORDER BY dr.updated_at DESC`,
        [userId]
      );
      
      res.json({ documents: result.rows });
    } catch (error: any) {
      console.error('Get sent back to me error:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        stack: error.stack
      });
      res.status(500).json({ 
        error: 'Failed to get documents sent back to me',
        details: error.message 
      });
    }
  }
);

export default router;
