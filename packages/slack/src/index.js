/**
 * v3.3.0: Slack integration — send notifications, receive commands.
 *
 * Features:
 *   - Send session updates to Slack channels
 *   - Receive slash commands from Slack
 *   - Interactive approval buttons
 *   - Session sharing via Slack
 */

const SLACK_API = "https://slack.com/api";

/**
 * Slack bot client.
 */
export class SlackBot {
  constructor(config) {
    this.token = config.token; // Bot User OAuth Token (xoxb-...)
    this.channel = config.channel; // default channel ID
    this.signingSecret = config.signingSecret;
  }

  /**
   * Post a message to a Slack channel.
   */
  async postMessage(text, options = {}) {
    const response = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        channel: options.channel || this.channel,
        text,
        blocks: options.blocks,
        attachments: options.attachments,
        thread_ts: options.threadTs,
        reply_broadcast: options.replyBroadcast || false,
        unfurl_links: options.unfurlLinks !== false,
      }),
    });
    return response.json();
  }

  /**
   * Send a session update notification.
   */
  async notifySessionUpdate(session) {
    const summary = session.summary || "Session updated";
    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: `🌙 Moon Code — ${session.title || "Session"}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Agent:* ${session.agent || "build"}` },
          { type: "mrkdwn", text: `*Status:* ${session.status || "completed"}` },
          { type: "mrkdwn", text: `*Files:* ${session.filesChanged || 0} changed` },
          { type: "mrkdwn", text: `*Tokens:* ${(session.tokens?.total || 0).toLocaleString()}` },
        ],
      },
    ];

    if (session.shareUrl) {
      blocks.push({
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "View Session" }, url: session.shareUrl, style: "primary" },
        ],
      });
    }

    return this.postMessage(summary, { blocks });
  }

  /**
   * Send an approval request with interactive buttons.
   */
  async requestApproval(approval) {
    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "⚠ Approval Required" },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Tool:* \`${approval.tool}\`\n*Summary:* ${approval.summary}` },
      },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "✓ Approve" }, style: "primary", value: `approve:${approval.id}`, action_id: "approve" },
          { type: "button", text: { type: "plain_text", text: "✗ Deny" }, style: "danger", value: `deny:${approval.id}`, action_id: "deny" },
        ],
      },
    ];

    return this.postMessage(`Approval needed: ${approval.tool}`, { blocks });
  }

  /**
   * Send an error notification.
   */
  async notifyError(error, context = {}) {
    const blocks = [
      { type: "header", text: { type: "plain_text", text: "✗ Moon Code Error" } },
      { type: "section", text: { type: "mrkdwn", text: `*Error:* ${error.message}\n*Context:* ${JSON.stringify(context).slice(0, 500)}` } },
    ];
    return this.postMessage(`Error: ${error.message}`, { blocks });
  }

  /**
   * Verify Slack webhook signature.
   */
  verifySignature(timestamp, body, signature) {
    const crypto = require("node:crypto");
    const sigBase = `v0:${timestamp}:${body}`;
    const expected = "v0=" + crypto.createHmac("sha256", this.signingSecret).update(sigBase).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  /**
   * Handle an interactive payload (button click, slash command).
   */
  async handleInteraction(payload) {
    const { type, actions, response_url } = payload;

    if (type === "block_actions" && actions) {
      for (const action of actions) {
        const [decision, approvalId] = (action.value || "").split(":");
        if (decision === "approve" || decision === "deny") {
          return { type: "approval_response", approvalId, decision };
        }
      }
    }

    if (type === "slash_command") {
      return { type: "slash_command", command: payload.command, text: payload.text };
    }

    return { type: "unknown" };
  }
}

/**
 * Create a Slack webhook handler for Express/http servers.
 */
export function createSlackWebhookHandler(bot) {
  return async (request, response) => {
    const timestamp = request.headers["x-slack-request-timestamp"];
    const signature = request.headers["x-slack-signature"];
    const body = JSON.stringify(request.body);

    if (!bot.verifySignature(timestamp, body, signature)) {
      return response.status(401).json({ error: "Invalid signature" });
    }

    const payload = request.body.type === "url_verification"
      ? { challenge: request.body.challenge }
      : await bot.handleInteraction(request.body);

    response.json(payload);
  };
}
