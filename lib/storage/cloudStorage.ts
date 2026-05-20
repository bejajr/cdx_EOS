export const cloudStorageProvider = {
  async readText() {
    throw new Error("Cloud object storage is not configured yet.");
  },
  async writeText() {
    throw new Error("Cloud object storage is not configured yet.");
  }
};
