// Qloo access through the official `qloo mcp` server (stdio), as the hackathon kit recommends.
// The API key never leaves this backend: it comes from `qloo setup --qloo` or the
// QLOO_API_KEY environment variable and is forwarded only to the local `qloo mcp` process.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mockQlooCall } from "./mock-data.mjs";

const HACKATHON_HOST = "https://hackathon.api.qloo.com";
const INSTALL_HINT =
  "Cannot start `qloo`. Install it with: npm install --global @qloo/qloo-harness";

/** Normalise an MCP tool result into the Qloo result envelope. */
function toEnvelope(result) {
  let envelope = result?.structuredContent;
  if (!envelope) {
    const text = result?.content?.find((c) => c.type === "text")?.text;
    try {
      envelope = text ? JSON.parse(text) : {};
    } catch {
      envelope = { status: "error", summary: text ?? "Unreadable Qloo response" };
    }
  }
  if (envelope.status === undefined) {
    envelope = { ...envelope, status: "error", error: { code: "UNKNOWN", ...envelope.error } };
  }
  return envelope;
}

class LiveQloo {
  mode = "live";
  #client = null;
  #connecting = null;

  async #connect() {
    if (this.#client) return this.#client;
    if (this.#connecting) return this.#connecting;
    this.#connecting = (async () => {
      const env = {
        ...process.env,
        QLOO_BASE_URL: process.env.QLOO_BASE_URL || HACKATHON_HOST,
        QLOO_TRUSTED_BASE_URL: process.env.QLOO_TRUSTED_BASE_URL || HACKATHON_HOST,
      };
      // Pass the full environment, otherwise the SDK does not forward QLOO_API_KEY.
      const transport = new StdioClientTransport({ command: "qloo", args: ["mcp"], env });
      const client = new Client({ name: "tastetocontent", version: "0.1.0" });
      try {
        await client.connect(transport);
      } catch (error) {
        throw error.code === "ENOENT" ? new Error(INSTALL_HINT) : error;
      }
      client.onclose = () => {
        this.#client = null;
      };
      this.#client = client;
      return client;
    })();
    try {
      return await this.#connecting;
    } finally {
      this.#connecting = null;
    }
  }

  async readiness() {
    const client = await this.#connect();
    const caps = await client.callTool({ name: "qloo_capabilities", arguments: {} });
    return Boolean(caps.structuredContent?.adapter?.ready);
  }

  async call(tool, args) {
    const client = await this.#connect();
    const result = await client.callTool({ name: tool, arguments: args });
    return toEnvelope(result);
  }

  async close() {
    await this.#client?.close().catch(() => {});
    this.#client = null;
  }
}

class MockQloo {
  mode = "mock";
  async readiness() {
    return true;
  }
  async call(tool, args) {
    // Small delay so the UI progress feels like the live version.
    await new Promise((r) => setTimeout(r, 120));
    return mockQlooCall(tool, args);
  }
  async close() {}
}

export function createQloo() {
  const forceMock = process.env.QLOO_MOCK === "1";
  return forceMock ? new MockQloo() : new LiveQloo();
}

export { MockQloo };
