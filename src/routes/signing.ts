import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';
import { auditLog } from '../middleware/audit';
import { signPDF } from '../services/pdfSigner';
import { sendDocumentSignedNotification } from '../services/email';
import { TextField, Signature } from '../types';

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Configure multer for signature images
const signatureStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'signatures');
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

const signatureUpload = multer({
  storage: signatureStorage,
  limits: { fileSize: 5242880 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG and JPEG images are allowed'));
    }
  },
});

// Get draft data
router.get(
  '/:documentId/draft',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.documentId);
      const userId = req.user!.userId;
      
      // Verify user has access to this document
      const docCheck = await pool.query(
        `SELECT d.* FROM documents d
         JOIN document_recipients dr ON d.id = dr.document_id
         WHERE d.id = $1 AND dr.recipient_id = $2`,
        [documentId, userId]
      );
      
      if (docCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }
      
      // Get text fields
      const textFieldsResult = await pool.query(
        `SELECT * FROM text_fields
         WHERE document_id = $1 AND recipient_id = $2 AND is_draft = TRUE
         ORDER BY created_at`,
        [documentId, userId]
      );
      
      // Get signatures
      const signaturesResult = await pool.query(
        `SELECT * FROM signatures
         WHERE document_id = $1 AND recipient_id = $2 AND is_draft = TRUE
         ORDER BY created_at`,
        [documentId, userId]
      );
      
      res.json({
        textFields: textFieldsResult.rows,
        signatures: signaturesResult.rows,
      });
    } catch (error) {
      console.error('Get draft error:', error);
      res.status(500).json({ error: 'Failed to get draft' });
    }
  }
);

// Save draft
router.post(
  '/:documentId/draft',
  authenticate,
  auditLog('drafted'),
  async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.documentId);
      const userId = req.user!.userId;
      const { textFields, signatures } = req.body;
      
      // Verify user has access
      const docCheck = await pool.query(
        `SELECT d.* FROM documents d
         JOIN document_recipients dr ON d.id = dr.document_id
         WHERE d.id = $1 AND dr.recipient_id = $2`,
        [documentId, userId]
      );
      
      if (docCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }
      
      // Delete existing draft data
      await pool.query(
        'DELETE FROM text_fields WHERE document_id = $1 AND recipient_id = $2 AND is_draft = TRUE',
        [documentId, userId]
      );
      await pool.query(
        'DELETE FROM signatures WHERE document_id = $1 AND recipient_id = $2 AND is_draft = TRUE',
        [documentId, userId]
      );
      
      // Save text fields
      if (textFields && Array.isArray(textFields)) {
        for (const field of textFields) {
          await pool.query(
            `INSERT INTO text_fields (document_id, recipient_id, page_number, x_coordinate, y_coordinate, width, height, font_size, text_content, is_draft)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)`,
            [
              documentId,
              userId,
              field.page_number,
              field.x_coordinate,
              field.y_coordinate,
              field.width,
              field.height,
              field.font_size,
              field.text_content,
            ]
          );
        }
      }
      
      // Save signatures
      if (signatures && Array.isArray(signatures)) {
        for (const sig of signatures) {
          await pool.query(
            `INSERT INTO signatures (document_id, recipient_id, page_number, x_coordinate, y_coordinate, width, height, signature_image_path, is_draft)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
            [
              documentId,
              userId,
              sig.page_number,
              sig.x_coordinate,
              sig.y_coordinate,
              sig.width,
              sig.height,
              sig.signature_image_path,
            ]
          );
        }
      }
      
      // Update recipient status to draft
      await pool.query(
        'UPDATE document_recipients SET status = $1 WHERE document_id = $2 AND recipient_id = $3',
        ['draft', documentId, userId]
      );
      
      res.json({ message: 'Draft saved successfully' });
    } catch (error) {
      console.error('Save draft error:', error);
      res.status(500).json({ error: 'Failed to save draft' });
    }
  }
);

// Upload signature image
router.post(
  '/signature/upload',
  authenticate,
  signatureUpload.single('signature'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No signature file uploaded' });
      }
      
      res.json({
        signature_path: req.file.path,
        signature_url: `/api/signatures/${path.basename(req.file.path)}`,
      });
    } catch (error) {
      console.error('Signature upload error:', error);
      res.status(500).json({ error: 'Failed to upload signature' });
    }
  }
);

// Submit signed document
router.post(
  '/:documentId/submit',
  authenticate,
  auditLog('signed'),
  async (req: AuthRequest, res) => {
    try {
      const documentId = parseInt(req.params.documentId);
      const userId = req.user!.userId;
      const { textFields, signatures } = req.body;
      
      // Verify user has access
      const docResult = await pool.query(
        `SELECT d.*, u.email as uploader_email, u.full_name as uploader_name
         FROM documents d
         JOIN document_recipients dr ON d.id = dr.document_id
         JOIN users u ON d.uploaded_by = u.id
         WHERE d.id = $1 AND dr.recipient_id = $2`,
        [documentId, userId]
      );
      
      if (docResult.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found or access denied' });
      }
      
      const document = docResult.rows[0];
      
      // Get user info
      const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = userResult.rows[0];
      
      // Delete existing draft data
      await pool.query(
        'DELETE FROM text_fields WHERE document_id = $1 AND recipient_id = $2',
        [documentId, userId]
      );
      await pool.query(
        'DELETE FROM signatures WHERE document_id = $1 AND recipient_id = $2',
        [documentId, userId]
      );
      
      // Save text fields (not draft)
      if (textFields && Array.isArray(textFields)) {
        for (const field of textFields) {
          await pool.query(
            `INSERT INTO text_fields (document_id, recipient_id, page_number, x_coordinate, y_coordinate, width, height, font_size, text_content, is_draft)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)`,
            [
              documentId,
              userId,
              field.page_number,
              field.x_coordinate,
              field.y_coordinate,
              field.width,
              field.height,
              field.font_size,
              field.text_content,
            ]
          );
        }
      }
      
      // Save signatures (not draft)
      if (signatures && Array.isArray(signatures)) {
        for (const sig of signatures) {
          await pool.query(
            `INSERT INTO signatures (document_id, recipient_id, page_number, x_coordinate, y_coordinate, width, height, signature_image_path, is_draft)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)`,
            [
              documentId,
              userId,
              sig.page_number,
              sig.x_coordinate,
              sig.y_coordinate,
              sig.width,
              sig.height,
              sig.signature_image_path,
            ]
          );
        }
      }
      
      // Get all signatures and text fields for this document (all recipients)
      const allTextFieldsResult = await pool.query(
        'SELECT * FROM text_fields WHERE document_id = $1 AND is_draft = FALSE',
        [documentId]
      );
      
      const allSignaturesResult = await pool.query(
        'SELECT * FROM signatures WHERE document_id = $1 AND is_draft = FALSE',
        [documentId]
      );
      
      // Sign the PDF
      const signedFilePath = path.join(UPLOAD_DIR, 'signed', `signed-${documentId}-${Date.now()}.pdf`);
      await signPDF(
        document.original_file_path,
        signedFilePath,
        allTextFieldsResult.rows,
        allSignaturesResult.rows
      );
      
      // Update recipient status
      await pool.query(
        'UPDATE document_recipients SET status = $1, signed_at = CURRENT_TIMESTAMP WHERE document_id = $2 AND recipient_id = $3',
        ['signed', documentId, userId]
      );
      
      // Check if all recipients have signed
      const remainingRecipients = await pool.query(
        `SELECT COUNT(*) as count 
         FROM document_recipients 
         WHERE document_id = $1 AND status IN ('pending', 'draft')`,
        [documentId]
      );
      
      // Update document status
      let newStatus = 'sent_for_signing'; // Still waiting for other recipients
      if (parseInt(remainingRecipients.rows[0].count) === 0) {
        // All recipients have signed, change to waiting_confirmation
        newStatus = 'waiting_confirmation';
      }
      
      await pool.query(
        'UPDATE documents SET signed_file_path = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [signedFilePath, newStatus, documentId]
      );
      
      // Send notification to uploader
      try {
        await sendDocumentSignedNotification(
          document.uploader_email,
          document.uploader_name,
          document.title,
          user.full_name
        );
      } catch (emailError) {
        console.error('Failed to send notification email:', emailError);
      }
      
      res.json({ message: 'Document signed successfully', signed_file_path: signedFilePath });
    } catch (error) {
      console.error('Submit signature error:', error);
      res.status(500).json({ error: 'Failed to submit signature' });
    }
  }
);

// Serve signature images
router.get('/signatures/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(UPLOAD_DIR, 'signatures', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Signature not found' });
    }
    
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('Serve signature error:', error);
    res.status(500).json({ error: 'Failed to serve signature' });
  }
});

export default router;

