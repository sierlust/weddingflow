export type UploadQueueStatus = 'Queued' | 'Uploading' | 'Paused' | 'Failed' | 'Completed';

export type UploadQueueItem = {
  id: string;
  filename: string;
  size: number;
  progress: number;
  status: UploadQueueStatus;
  retryCount: number;
  error?: string;
  warning?: string;
};

type LocalFileLike = {
  name: string;
  size: number;
};

/**
 * Phase 4.3.2 + 4.3.3 + 4.3.6 Upload queue manager
 * Static singleton state makes it navigation-persistent.
 */
export class UploadManager {
  private static queue = new Map<string, UploadQueueItem>();

  static addFile(file: LocalFileLike, options: { warning?: string } = {}) {
    const id = `upload-${Math.random().toString(36).slice(2, 10)}`;
    const item: UploadQueueItem = {
      id,
      filename: file.name,
      size: file.size,
      progress: 0,
      status: 'Queued',
      retryCount: 0,
      warning: options.warning,
    };
    this.queue.set(id, item);
    return item;
  }

  static startUpload(id: string) {
    const item = this.queue.get(id);
    if (!item) {
      return null;
    }
    item.status = 'Uploading';
    if (item.progress === 0) {
      item.progress = 10;
    }
    return item;
  }

  static updateProgress(id: string, progress: number) {
    const item = this.queue.get(id);
    if (!item) {
      return null;
    }
    item.progress = Math.max(0, Math.min(100, progress));
    if (item.progress >= 100) {
      item.status = 'Completed';
    }
    return item;
  }

  static pauseUpload(id: string) {
    const item = this.queue.get(id);
    if (!item || item.status !== 'Uploading') {
      return null;
    }
    item.status = 'Paused';
    return item;
  }

  static resumeUpload(id: string) {
    const item = this.queue.get(id);
    if (!item || (item.status !== 'Paused' && item.status !== 'Failed')) {
      return null;
    }
    item.status = 'Uploading';
    item.error = undefined;
    return item;
  }

  static markFailed(id: string, errorMessage: string, canRetry: boolean) {
    const item = this.queue.get(id);
    if (!item) {
      return null;
    }
    item.status = 'Failed';
    item.error = errorMessage;
    if (!canRetry) {
      item.retryCount = 3;
    }
    return item;
  }

  static async retryUpload(id: string, uploader: () => Promise<void>) {
    const item = this.queue.get(id);
    if (!item || item.retryCount >= 3) {
      return null;
    }

    item.status = 'Uploading';
    item.error = undefined;

    let delayMs = 250;
    for (let attempt = item.retryCount; attempt < 3; attempt += 1) {
      try {
        await uploader();
        item.status = 'Completed';
        item.progress = 100;
        item.retryCount = attempt;
        return item;
      } catch (error: any) {
        item.retryCount = attempt + 1;
        if (item.retryCount >= 3) {
          item.status = 'Failed';
          item.error = error?.message || 'Upload failed';
          return item;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2;
      }
    }

    return item;
  }

  static removeUpload(id: string) {
    return this.queue.delete(id);
  }

  static getQueue() {
    return Array.from(this.queue.values());
  }

  static clearStateForTests() {
    this.queue.clear();
  }
}

