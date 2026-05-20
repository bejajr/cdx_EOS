export const googleDriveConnector = {
  async search() {
    return {
      provider: "google_drive",
      content: "Google Drive connector placeholder. OAuth and Drive sync are not implemented yet.",
      metadata: { implemented: false }
    };
  }
};
