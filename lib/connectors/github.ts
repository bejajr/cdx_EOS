export const githubConnector = {
  async search() {
    return {
      provider: "github",
      content: "GitHub connector placeholder. OAuth/token sync is not implemented yet.",
      metadata: { implemented: false }
    };
  }
};
