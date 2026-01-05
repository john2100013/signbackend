import { Response, NextFunction } from 'express';
import pool from '../db/connection';
import { AuthRequest } from './auth';

export function auditLog(action: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const originalSend = res.json;
    
    res.json = function (data: any) {
      // Log after response is sent
      setImmediate(async () => {
        try {
          await pool.query(
            `INSERT INTO audit_logs (user_id, document_id, action, details, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              req.user?.userId || null,
              (req.body?.document_id || req.params?.id) || null,
              action,
              JSON.stringify({ body: req.body, params: req.params, query: req.query }),
              req.ip || req.socket.remoteAddress,
              req.get('user-agent') || null,
            ]
          );
        } catch (error) {
          console.error('Audit log error:', error);
        }
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

