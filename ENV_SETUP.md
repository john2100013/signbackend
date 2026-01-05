# Environment Configuration

## Backend .env File

Create a file named `.env` in the `backend` directory with the following content:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=easysign
DB_USER=postgres
DB_PASSWORD=Password

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars
JWT_EXPIRES_IN=7d

# File Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# Email Configuration (SMTP)
EMAIL_HOST=smtp.office365.com
EMAIL_PORT=587
EMAIL_USER=18e8c899a2db7d
EMAIL_PASS=c1fafccdffcd64
EMAIL_FROM=noreply@easysign.com
EMAIL_SECURE=false

# PowerAutomate Webhook Configuration (Optional - for additional automation)
POWERAUTOMATE_WEBHOOK_URL=
POWERAUTOMATE_ENABLED=false

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:5173
```

## Frontend .env File

Create a file named `.env` in the `frontend` directory with the following content:

```env
VITE_API_URL=http://localhost:3001/api
```

## PowerAutomate Setup (Optional)

If you want to use PowerAutomate in addition to SMTP:

1. Set `POWERAUTOMATE_ENABLED=true`
2. Set `POWERAUTOMATE_WEBHOOK_URL` to your PowerAutomate webhook URL
3. The application will send notifications via both SMTP and PowerAutomate

## Notes

- The application will use SMTP by default
- If PowerAutomate is enabled, it will send via both methods
- If SMTP fails, it will still try PowerAutomate (and vice versa)
- Database password is set to: `Password`
- SMTP credentials are configured for Office 365

