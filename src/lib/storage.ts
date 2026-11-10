import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Lagring af dokumentationsfiler. Lokal disk i udvikling; en S3/Azure-implementering
 * kan sættes på senere uden at ændre resten af koden.
 */
export interface FileStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalDiskStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    if (!/^[a-zA-Z0-9/_-]+$/.test(key)) throw new Error("Ugyldig storage-nøgle");
    return path.join(this.root, key);
  }

  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async get(key: string) {
    return readFile(this.resolve(key));
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

export const storage: FileStorage = new LocalDiskStorage(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"));

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "text/csv": "CSV",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.ms-excel": "Excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
};
