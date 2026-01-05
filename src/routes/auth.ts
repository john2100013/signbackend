import express from 'express';
import pool from '../db/connection';
import { hashPassword, comparePassword, generateRandomPassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendDocumentAssignmentEmail } from '../services/email';

const router = express.Router();

// Register (for management users)
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, role } = req.body;
    
    // Validation
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, password, and full name are required' });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Full name validation
    if (full_name.trim().length < 2) {
      return res.status(400).json({ error: 'Full name must be at least 2 characters long' });
    }
    
    // Role validation
    const validRoles = ['management', 'recipient'];
    const userRole = role && validRoles.includes(role) ? role : 'management';
    
    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    const passwordHash = await hashPassword(password);
    
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, is_external)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, role, is_external, created_at`,
      [email.toLowerCase().trim(), passwordHash, full_name.trim(), userRole, false]
    );
    
    res.status(201).json({ 
      message: 'Account created successfully',
      user: result.rows[0] 
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const result = await pool.query(
      'SELECT id, email, password_hash, full_name, role, is_external, must_change_password FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const isValid = await comparePassword(password, user.password_hash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        is_external: user.is_external,
        must_change_password: user.must_change_password,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Change password
router.post('/change-password', authenticate, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.userId;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }
    
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isValid = await comparePassword(currentPassword, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    const newPasswordHash = await hashPassword(newPassword);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    
    const result = await pool.query(
      'SELECT id, email, full_name, role, is_external, must_change_password, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Get all users (for assignment selection)
router.get('/users', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, full_name, role, is_external FROM users ORDER BY full_name ASC'
    );
    
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

export default router;

