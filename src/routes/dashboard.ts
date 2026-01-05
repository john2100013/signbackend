import express from 'express';
import pool from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get dashboard stats (management)
router.get(
  '/stats',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const userRole = req.user!.role;

      if (userRole === 'management') {
        // Management stats
        const totalDocs = await pool.query(
          'SELECT COUNT(*) as count FROM documents WHERE uploaded_by = $1',
          [userId]
        );
        
        const pendingSigs = await pool.query(
          `SELECT COUNT(DISTINCT dr.document_id) as count
           FROM document_recipients dr
           JOIN documents d ON dr.document_id = d.id
           WHERE d.uploaded_by = $1 AND dr.status = 'pending'`,
          [userId]
        );
        
        const signedDocs = await pool.query(
          `SELECT COUNT(DISTINCT dr.document_id) as count
           FROM document_recipients dr
           JOIN documents d ON dr.document_id = d.id
           WHERE d.uploaded_by = $1 AND dr.status = 'signed'`,
          [userId]
        );
        
        const waitingConfirmation = await pool.query(
          `SELECT COUNT(DISTINCT d.id) as count
           FROM documents d
           JOIN document_recipients dr ON d.id = dr.document_id
           WHERE d.uploaded_by = $1 AND dr.status = 'signed' AND d.status = 'waiting_confirmation'`,
          [userId]
        );
        
        const draftDocs = await pool.query(
          'SELECT COUNT(*) as count FROM documents WHERE uploaded_by = $1 AND status = $2',
          [userId, 'draft']
        );
        
        // Count documents sent for signing (have at least one recipient with pending/draft status)
        const sentForSigning = await pool.query(
          `SELECT COUNT(DISTINCT d.id) as count
           FROM documents d
           JOIN document_recipients dr ON d.id = dr.document_id
           WHERE d.uploaded_by = $1 
             AND dr.status IN ('pending', 'draft')
             AND d.status IN ('sent_for_signing', 'pending')`,
          [userId]
        );

        // Calculate trends (simplified - compare with last month)
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        
        const totalDocsLastMonth = await pool.query(
          'SELECT COUNT(*) as count FROM documents WHERE uploaded_by = $1 AND created_at < $2',
          [userId, lastMonth]
        );
        
        const signedDocsLastMonth = await pool.query(
          `SELECT COUNT(DISTINCT dr.document_id) as count
           FROM document_recipients dr
           JOIN documents d ON dr.document_id = d.id
           WHERE d.uploaded_by = $1 AND dr.status = 'signed' AND dr.signed_at < $2`,
          [userId, lastMonth]
        );

        const totalDocsCount = parseInt(totalDocs.rows[0].count);
        const totalDocsLastMonthCount = parseInt(totalDocsLastMonth.rows[0].count);
        const totalDocsTrend = totalDocsLastMonthCount > 0 
          ? Math.round(((totalDocsCount - totalDocsLastMonthCount) / totalDocsLastMonthCount) * 100)
          : 0;

        const signedDocsCount = parseInt(signedDocs.rows[0].count);
        const signedDocsLastMonthCount = parseInt(signedDocsLastMonth.rows[0].count);
        const signedDocsTrend = signedDocsLastMonthCount > 0
          ? Math.round(((signedDocsCount - signedDocsLastMonthCount) / signedDocsLastMonthCount) * 100)
          : 0;

        res.json({
          totalDocuments: totalDocsCount,
          totalDocumentsTrend: totalDocsTrend,
          pendingSignatures: parseInt(pendingSigs.rows[0].count),
          signedDocuments: signedDocsCount,
          signedDocumentsTrend: signedDocsTrend,
          draftDocuments: parseInt(draftDocs.rows[0].count),
          waitingConfirmation: parseInt(waitingConfirmation.rows[0].count),
          sentForSigning: parseInt(sentForSigning.rows[0].count),
        });
      } else {
        // Recipient stats - check for any user with assignments (regardless of role)
        const pendingDocs = await pool.query(
          'SELECT COUNT(*) as count FROM document_recipients WHERE recipient_id = $1 AND status = $2',
          [userId, 'pending']
        );
        
        const draftDocs = await pool.query(
          'SELECT COUNT(*) as count FROM document_recipients WHERE recipient_id = $1 AND status = $2',
          [userId, 'draft']
        );
        
        const signedDocs = await pool.query(
          'SELECT COUNT(*) as count FROM document_recipients WHERE recipient_id = $1 AND status = $2',
          [userId, 'signed']
        );

        res.json({
          pendingDocuments: parseInt(pendingDocs.rows[0].count),
          draftDocuments: parseInt(draftDocs.rows[0].count),
          signedDocuments: parseInt(signedDocs.rows[0].count),
        });
      }
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  }
);

// Get recent activity
router.get(
  '/activity',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId;
      const userRole = req.user!.role;
      const limit = parseInt(req.query.limit as string) || 10;

      if (userRole === 'management') {
        // Management activity: uploads, assignments, signatures
        const activity = await pool.query(
          `SELECT 
            'uploaded' as action,
            d.id as document_id,
            d.title as document_title,
            d.created_at as timestamp,
            NULL as recipient_email,
            NULL as recipient_name,
            u.full_name as actor_name
           FROM documents d
           JOIN users u ON d.uploaded_by = u.id
           WHERE d.uploaded_by = $1
           
           UNION ALL
           
           SELECT 
             'assigned' as action,
             d.id as document_id,
             d.title as document_title,
             dr.created_at as timestamp,
             u2.email as recipient_email,
             u2.full_name as recipient_name,
             u.full_name as actor_name
           FROM document_recipients dr
           JOIN documents d ON dr.document_id = d.id
           JOIN users u ON d.uploaded_by = u.id
           JOIN users u2 ON dr.recipient_id = u2.id
           WHERE d.uploaded_by = $1
           
           UNION ALL
           
           SELECT 
             'signed' as action,
             d.id as document_id,
             d.title as document_title,
             dr.signed_at as timestamp,
             u2.email as recipient_email,
             u2.full_name as recipient_name,
             u.full_name as actor_name
           FROM document_recipients dr
           JOIN documents d ON dr.document_id = d.id
           JOIN users u ON d.uploaded_by = u.id
           JOIN users u2 ON dr.recipient_id = u2.id
           WHERE d.uploaded_by = $1 AND dr.status = 'signed' AND dr.signed_at IS NOT NULL
           
           ORDER BY timestamp DESC
           LIMIT $2`,
          [userId, limit]
        );

        res.json({ activities: activity.rows });
      } else {
        // Recipient activity: assigned documents, signed documents
        const activity = await pool.query(
          `SELECT 
            'assigned' as action,
            d.id as document_id,
            d.title as document_title,
            dr.created_at as timestamp,
            u.full_name as sender_name,
            dr.status
           FROM document_recipients dr
           JOIN documents d ON dr.document_id = d.id
           JOIN users u ON d.uploaded_by = u.id
           WHERE dr.recipient_id = $1
           
           ORDER BY timestamp DESC
           LIMIT $2`,
          [userId, limit]
        );

        res.json({ activities: activity.rows });
      }
    } catch (error) {
      console.error('Get activity error:', error);
      res.status(500).json({ error: 'Failed to get activity' });
    }
  }
);

export default router;

