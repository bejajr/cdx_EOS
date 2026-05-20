import { join } from "node:path";
import { APP_MODE, DEFAULT_GROUP_ID, DEFAULT_USER_ID, DEFAULT_WORKSPACE_ID } from "./db";
import { LOCAL_EMBEDDING_DIMENSIONS, LOCAL_EMBEDDING_MODEL } from "./embeddings";

const root = process.cwd();

export function getConfigStatus() {
  return {
    appMode: APP_MODE,
    workspace: {
      defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
      defaultUserId: DEFAULT_USER_ID,
      defaultGroupId: DEFAULT_GROUP_ID
    },
    database: {
      provider: "sqlite",
      path: join("work-wiki-data", "work-wiki.sqlite")
    },
    llm: {
      provider: "openai",
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini"
    },
    retrieval: {
      mode: "hybrid-keyword-local-vector",
      embeddingProvider: "local",
      embeddingModel: LOCAL_EMBEDDING_MODEL,
      embeddingDimensions: LOCAL_EMBEDDING_DIMENSIONS
    },
    storage: {
      localDataDir: join(root, "work-wiki-data")
    },
    connectors: {
      localFiles: { available: APP_MODE === "local", configured: APP_MODE === "local" },
      github: { configured: false, placeholder: true },
      googleDrive: { configured: false, placeholder: true },
      slack: { configured: false, placeholder: true },
      microsoft: { configured: Boolean(process.env.MICROSOFT_CLIENT_ID), placeholder: true }
    }
  };
}
