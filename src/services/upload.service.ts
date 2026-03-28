type UploadStatus = 'queued' | 'uploading' | 'failed' | 'completed' | 'aborted';

type UploadRecord = {
  uploadId: string;
  weddingId: string;
  filename: string;
  fileType: string;
  sizeBytes: number;
  uploadedBytes: number;
  uploadedParts: Set<number>;
  createdAt: Date;
  status: UploadStatus;
};

type CompletedUploadRecord = {
  weddingId: string;
  filename: string;
  sizeBytes: number;
  createdAt: Date;
};

const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024;
const SUPPORTED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'video/mp4',
  'application/zip',
]);

export class UploadValidationError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Phase 4.3 Large-File Upload Service
 */
export class UploadService {
  private static uploads: Map<string, UploadRecord> = new Map();
  private static completedUploads: CompletedUploadRecord[] = [];

  /**
   * 4.3.1 Initiate resumable S3 multipart upload
   * 4.3.4 Validation failure before upload starts
   * 4.3.5 Duplicate detection warning
   */
  static async initiateMultipart(filename: string, fileType: string, weddingId: string, sizeBytes: number) {
    this.validateUploadInput(filename, fileType, sizeBytes);
    const uploadId = `s3-multipart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date();

    const record: UploadRecord = {
      uploadId,
      weddingId,
      filename,
      fileType,
      sizeBytes,
      uploadedBytes: 0,
      uploadedParts: new Set<number>(),
      createdAt,
      status: 'queued',
    };
    this.uploads.set(uploadId, record);

    const duplicate = this.findRecentDuplicate(weddingId, filename, sizeBytes, createdAt);
    return {
      uploadId,
      key: `uploads/${weddingId}/${uploadId}-${filename}`,
      warning: duplicate
        ? {
            message: 'A file with the same name and size was uploaded recently',
            actions: ['Upload anyway', 'View existing file'],
          }
        : null,
      minPartSizeBytes: MIN_PART_SIZE_BYTES,
    };
  }

  /**
   * 4.3.1 Upload multipart chunk
   * 4.3.7 Enforce minimum part size except final part
   */
  static async uploadPart(uploadId: string, partNumber: number, data: Buffer) {
    const upload = this.uploads.get(uploadId);
    if (!upload) {
      throw new UploadValidationError('UPLOAD_NOT_FOUND', 'Upload session not found.', 404);
    }
    if (upload.status === 'aborted') {
      throw new UploadValidationError('UPLOAD_ABORTED', 'Upload session has been aborted.', 409);
    }
    if (upload.status === 'completed') {
      throw new UploadValidationError('UPLOAD_ALREADY_COMPLETED', 'Upload session already completed.', 409);
    }

    const isFinalPart = partNumber === -1;
    if (!isFinalPart && data.length < MIN_PART_SIZE_BYTES) {
      throw new UploadValidationError(
        'PART_TOO_SMALL',
        `Multipart chunks must be at least ${MIN_PART_SIZE_BYTES} bytes unless final part.`
      );
    }

    upload.status = 'uploading';
    upload.uploadedBytes += data.length;
    upload.uploadedParts.add(partNumber);

    if (upload.uploadedBytes >= upload.sizeBytes || isFinalPart) {
      upload.status = 'completed';
      this.completedUploads.push({
        weddingId: upload.weddingId,
        filename: upload.filename,
        sizeBytes: upload.sizeBytes,
        createdAt: new Date(),
      });
    }

    return {
      etag: `etag-part-${partNumber}`,
      uploadedBytes: upload.uploadedBytes,
      status: upload.status,
    };
  }

  /**
   * 4.3.7 Abort upload and cleanup incomplete multipart session
   */
  static async abortUpload(uploadId: string) {
    const upload = this.uploads.get(uploadId);
    if (upload) {
      upload.status = 'aborted';
    }
    this.uploads.delete(uploadId);
    return { success: true, uploadId };
  }

  static getUpload(uploadId: string) {
    return this.uploads.get(uploadId) || null;
  }

  /**
   * 4.3.3 Auto-retry with exponential backoff
   */
  static async uploadWithRetry<T>(fn: () => Promise<T>, attempts = 3, delay = 1000): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (attempts <= 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.uploadWithRetry(fn, attempts - 1, delay * 2);
    }
  }

  static clearStateForTests() {
    this.uploads.clear();
    this.completedUploads = [];
  }

  private static validateUploadInput(filename: string, fileType: string, sizeBytes: number) {
    if (!filename || !filename.trim()) {
      throw new UploadValidationError('INVALID_FILENAME', 'Filename is required.');
    }
    if (!SUPPORTED_TYPES.has(fileType)) {
      throw new UploadValidationError('INVALID_FILE_TYPE', 'Unsupported file type.');
    }
    if (sizeBytes <= 0) {
      throw new UploadValidationError('INVALID_FILE_SIZE', 'File size must be greater than 0.');
    }
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new UploadValidationError('FILE_TOO_LARGE', `File too large (max ${MAX_FILE_SIZE_BYTES} bytes).`);
    }
  }

  private static findRecentDuplicate(weddingId: string, filename: string, sizeBytes: number, now: Date) {
    const threshold = now.getTime() - 24 * 60 * 60 * 1000;
    return this.completedUploads.some(
      (entry) =>
        entry.weddingId === weddingId &&
        entry.filename === filename &&
        entry.sizeBytes === sizeBytes &&
        entry.createdAt.getTime() >= threshold
    );
  }
}

