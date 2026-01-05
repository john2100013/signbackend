# Database Connection Troubleshooting

## Error: password authentication failed for user "postgres"

This error means PostgreSQL cannot authenticate with the provided credentials.

## Quick Fix Steps

### 1. Verify .env File Exists

Make sure you have a `.env` file in the `backend` directory with the following content:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=easysign
DB_USER=postgres
DB_PASSWORD=Password
```

**Important**: Replace `Password` with your actual PostgreSQL password if it's different.

### 2. Check PostgreSQL is Running

**Windows:**
```powershell
# Check if PostgreSQL service is running
Get-Service -Name postgresql*

# Start PostgreSQL if not running
Start-Service -Name postgresql-x64-XX  # Replace XX with your version
```

**Or check in Services:**
- Press `Win + R`, type `services.msc`
- Look for "postgresql" service
- Make sure it's running

### 3. Verify Database Password

The password in your `.env` file must match your PostgreSQL `postgres` user password.

**To check/reset PostgreSQL password:**

1. Open Command Prompt as Administrator
2. Navigate to PostgreSQL bin directory (usually `C:\Program Files\PostgreSQL\XX\bin`)
3. Run:
```bash
psql -U postgres
```

If it asks for a password and you don't know it, you may need to:
- Check if you set it during PostgreSQL installation
- Reset it using Windows authentication

### 4. Create the Database

If the database doesn't exist, create it:

```bash
# Using psql
psql -U postgres
CREATE DATABASE easysign;
\q

# Or using createdb command
createdb -U postgres easysign
```

### 5. Test Database Connection

Run the test script:

```bash
cd backend
npm run test-db
```

This will show you exactly what connection details are being used and any errors.

### 6. Common Issues

**Issue: "database does not exist"**
- Solution: Create the database (step 4)

**Issue: "password authentication failed"**
- Solution: Verify the password in `.env` matches your PostgreSQL password
- Try resetting PostgreSQL password if needed

**Issue: "connection refused"**
- Solution: PostgreSQL service is not running (step 2)

**Issue: "role does not exist"**
- Solution: The user in `.env` doesn't exist. Use `postgres` or create the user.

### 7. Alternative: Use Different PostgreSQL User

If you have a different PostgreSQL user, update `.env`:

```env
DB_USER=your_username
DB_PASSWORD=your_password
```

### 8. Verify .env File Location

Make sure the `.env` file is in the `backend` directory, not the root:

```
signing doc/
├── backend/
│   ├── .env          ← Should be here
│   ├── src/
│   └── package.json
└── frontend/
```

### 9. Check for Typos

Common mistakes:
- Extra spaces: `DB_PASSWORD = Password` (wrong) vs `DB_PASSWORD=Password` (correct)
- Quotes: Don't use quotes in .env file values
- Case sensitivity: Variable names are case-sensitive

## Still Having Issues?

1. Run `npm run test-db` to see detailed connection info
2. Check PostgreSQL logs (usually in `C:\Program Files\PostgreSQL\XX\data\log`)
3. Verify PostgreSQL is listening on port 5432:
   ```bash
   netstat -an | findstr 5432
   ```

