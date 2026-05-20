export const slackConnector = {
  async search() {
    return {
      provider: "slack",
      content: "Slack connector placeholder. OAuth and Slack sync are not implemented yet.",
      metadata: { implemented: false }
    };
  }
};
