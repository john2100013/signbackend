# Document Storage Recommendations

## Current Implementation

The application currently uses **local filesystem storage** for documents. Files are stored in:
- `./uploads/originals/` - Original uploaded documents
- `./uploads/signed/` - Signed PDF documents
- `./uploads/signatures/` - Signature images

## Storage Options

### 1. **Local Filesystem (Current)**
**Pros:**
- Simple setup, no additional services needed
- Fast access
- No additional costs
- Good for development and small deployments

**Cons:**
- Not scalable for large deployments
- Requires manual backup
- Limited to single server
- No built-in redundancy

**Best for:** Development, small teams, single-server deployments

---

### 2. **Amazon S3 (Recommended for Production)**
**Pros:**
- Highly scalable
- Built-in redundancy and backup
- CDN integration (CloudFront)
- Versioning support
- Lifecycle policies
- Secure access controls
- Cost-effective for large scale

**Cons:**
- Requires AWS account
- Additional configuration
- Small learning curve

**Implementation:**
```typescript
// Install: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
```

**Best for:** Production, large scale, multi-server deployments

---

### 3. **Azure Blob Storage**
**Pros:**
- Enterprise-grade security
- Integration with Azure services
- Good for Microsoft ecosystem
- Cost-effective tiers

**Cons:**
- Requires Azure account
- Microsoft ecosystem lock-in

**Best for:** Organizations using Microsoft Azure

---

### 4. **Google Cloud Storage**
**Pros:**
- Excellent performance
- Good integration with Google services
- Competitive pricing

**Cons:**
- Requires Google Cloud account
- Google ecosystem

**Best for:** Organizations using Google Cloud Platform

---

### 5. **DigitalOcean Spaces / Wasabi / Backblaze B2**
**Pros:**
- S3-compatible API
- Lower costs than AWS
- Simple pricing

**Cons:**
- Smaller ecosystem
- Less features than AWS

**Best for:** Cost-conscious deployments, S3-compatible needs

---

## Recommended Migration Path

### Phase 1: Current (Local Filesystem)
- Use for development and initial deployment
- Monitor storage usage
- Implement regular backups

### Phase 2: Hybrid Approach
- Keep local for development
- Use S3 for production
- Abstract storage behind a service interface

### Phase 3: Full Cloud Storage
- Migrate all storage to S3 or equivalent
- Implement CDN for faster access
- Add lifecycle policies for old documents

## Implementation Strategy

### Create Storage Service Interface

```typescript
// backend/src/services/storage.ts
interface StorageService {
  upload(file: Buffer, path: string): Promise<string>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  getUrl(path: string): Promise<string>;
}

class LocalStorageService implements StorageService {
  // Current implementation
}

class S3StorageService implements StorageService {
  // S3 implementation
}

// Use environment variable to switch
const storageService = process.env.STORAGE_TYPE === 's3' 
  ? new S3StorageService() 
  : new LocalStorageService();
```

## Environment Configuration

Add to `.env`:
```env
# Storage Configuration
STORAGE_TYPE=local  # or 's3', 'azure', 'gcs'

# AWS S3 Configuration (if using S3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET=easysign-documents

# Or keep using local
UPLOAD_DIR=./uploads
```

## Security Considerations

1. **Access Control**: Use signed URLs for document access
2. **Encryption**: Enable encryption at rest
3. **Backup**: Regular automated backups
4. **Retention**: Implement document retention policies
5. **Audit**: Log all document access

## Cost Estimation

### Local Filesystem
- **Cost**: $0 (server storage costs only)
- **Scalability**: Limited by server storage

### AWS S3
- **Storage**: ~$0.023/GB/month
- **Requests**: ~$0.005 per 1,000 requests
- **Data Transfer**: First 100GB free, then ~$0.09/GB

**Example**: 100GB storage, 10,000 requests/month ≈ $2.30/month

## Recommendation

**For Development**: Continue with local filesystem

**For Production**: Migrate to **Amazon S3** or **DigitalOcean Spaces** for:
- Better scalability
- Built-in redundancy
- Cost-effectiveness
- Easy migration path

## Migration Script

When ready to migrate, create a script to:
1. Upload existing files to cloud storage
2. Update database paths
3. Verify all files are accessible
4. Keep local files as backup initially

