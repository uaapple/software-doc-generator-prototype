function contentPartToText(part) {
  if (typeof part === "string") {
    return part;
  }
  if (!part || typeof part !== "object") {
    return "";
  }
  if (typeof part.text === "string") {
    return part.text;
  }
  if (typeof part.input_text === "string") {
    return part.input_text;
  }
  if (part.type === "text" && typeof part.content === "string") {
    return part.content;
  }
  return "";
}

function messageContentToText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((part) => contentPartToText(part)).filter(Boolean).join("\n\n");
}

export function normalizeChatMessages(messages = [], options = {}) {
  const normalized = (messages || [])
    .map((message) => ({
      role: message?.role || "user",
      content: messageContentToText(message?.content)
    }))
    .filter((message) => message.content);

  if (options.schema) {
    const schemaInstruction = [
      "你必须只输出一个合法的 JSON 对象，不要输出 Markdown，不要输出额外解释。",
      `输出目标名称：${options.schemaName || "response_payload"}`,
      "输出 JSON 必须满足以下 schema：",
      JSON.stringify(options.schema, null, 2)
    ].join("\n");

    const systemIndex = normalized.findIndex((message) => message.role === "system");
    if (systemIndex >= 0) {
      normalized[systemIndex] = {
        ...normalized[systemIndex],
        content: `${normalized[systemIndex].content}\n\n${schemaInstruction}`
      };
    } else {
      normalized.unshift({
        role: "system",
        content: schemaInstruction
      });
    }
  }

  return normalized;
}

export function extractChatCompletionText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("")
      .trim();
  }
  return "";
}

export async function createJsonChatCompletion(
  client,
  { model, messages, schemaName, schema, temperature = 0.2, includeRawResponse = false }
) {
  const response = await client.chat.completions.create({
    model,
    messages: normalizeChatMessages(messages, { schemaName, schema }),
    response_format: { type: "json_object" },
    temperature
  });

  const text = extractChatCompletionText(response);
  if (!text) {
    throw new Error("LLM returned empty response content");
  }

  try {
    const payload = JSON.parse(text);
    return includeRawResponse ? { payload, rawText: text } : payload;
  } catch (error) {
    error.message = `Failed to parse LLM JSON response: ${error.message}`;
    error.rawResponseText = text;
    error.rawResponseLength = text.length;
    throw error;
  }
}
