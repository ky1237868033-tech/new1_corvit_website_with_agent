const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

function jsonResponse(statusCode, payload) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: corsHeaders
  });
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.DIFY_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: "DIFY_API_KEY is not configured in the Netlify environment."
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "Request body must be valid JSON." });
  }

  const query = typeof payload?.query === "string" ? payload.query.trim() : "";
  if (!query) {
    return jsonResponse(400, { error: "A non-empty query is required." });
  }
  if (query.length > 4000) {
    return jsonResponse(413, { error: "Query is too long. Maximum length is 4000 characters." });
  }

  const baseUrl = (process.env.DIFY_BASE_URL || "https://api.dify.ai/v1").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/chat-messages`;

  try {
    const difyResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: "blocking",
        conversation_id: typeof payload.conversation_id === "string" ? payload.conversation_id : "",
        user: typeof payload.user === "string" && payload.user.trim()
          ? payload.user.trim().slice(0, 128)
          : "corvit-student"
      })
    });

    const responseText = await difyResponse.text();
    let difyData;
    try {
      difyData = responseText ? JSON.parse(responseText) : {};
    } catch {
      difyData = { message: responseText || "Dify returned an unreadable response." };
    }

    if (!difyResponse.ok) {
      const message = difyData.message || difyData.error || `Dify API returned HTTP ${difyResponse.status}.`;
      return jsonResponse(difyResponse.status >= 400 && difyResponse.status < 600 ? difyResponse.status : 502, {
        error: message,
        details: difyData
      });
    }

    return jsonResponse(200, {
      answer: difyData.answer || "",
      conversation_id: difyData.conversation_id || "",
      message_id: difyData.message_id || "",
      task_id: difyData.task_id || ""
    });
  } catch (error) {
    return jsonResponse(502, {
      error: "Unable to connect to the Dify API.",
      details: error instanceof Error ? error.message : "Unknown upstream error."
    });
  }
};
