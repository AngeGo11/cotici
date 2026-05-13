import http from "node:http";

const PROXY_PORT = Number(process.env.PROXY_PORT || 8001);
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://127.0.0.1:8000";

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8") || "{}";
};

const forwardPost = async (req, res, upstreamPath) => {
  try {
    const body = await readBody(req);
    const upstream = await fetch(`${BACKEND_BASE_URL}${upstreamPath}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body,
    });
    const payload = await upstream.text();
    res.writeHead(upstream.status, JSON_HEADERS);
    res.end(payload);
  } catch (error) {
    res.writeHead(502, JSON_HEADERS);
    res.end(
      JSON.stringify({
        detail: "Proxy error while reaching auth service.",
        error: error instanceof Error ? error.message : "Unknown proxy error",
      }),
    );
  }
};

const forwardGet = async (req, res, upstreamPath) => {
  try {
    const auth = req.headers.authorization;
    const upstreamHeaders = {};
    if (auth) {
      upstreamHeaders.Authorization = auth;
    }
    const upstream = await fetch(`${BACKEND_BASE_URL}${upstreamPath}`, {
      method: "GET",
      headers: upstreamHeaders,
    });
    const payload = await upstream.text();
    res.writeHead(upstream.status, JSON_HEADERS);
    res.end(payload);
  } catch (error) {
    res.writeHead(502, JSON_HEADERS);
    res.end(
      JSON.stringify({
        detail: "Proxy error while reaching auth service.",
        error: error instanceof Error ? error.message : "Unknown proxy error",
      }),
    );
  }
};

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400, JSON_HEADERS);
    res.end(JSON.stringify({ detail: "Invalid request URL." }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/login") {
    await forwardPost(req, res, "/api/auth/login/");
    return;
  }

  if (req.method === "POST" && req.url === "/api/register") {
    await forwardPost(req, res, "/api/auth/register/");
    return;
  }

  if (req.method === "POST" && req.url === "/api/request-otp") {
    await forwardPost(req, res, "/api/auth/request-otp/");
    return;
  }

  if (req.method === "POST" && req.url === "/api/verify-otp") {
    await forwardPost(req, res, "/api/auth/verify-otp/");
    return;
  }

  if (req.method === "POST" && req.url === "/api/resend-otp") {
    await forwardPost(req, res, "/api/auth/resend-otp/");
    return;
  }

  if (req.method === "POST" && req.url === "/api/refresh") {
    await forwardPost(req, res, "/api/auth/refresh/");
    return;
  }

  if (req.method === "GET" && req.url === "/api/me") {
    await forwardGet(req, res, "/api/auth/me/");
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, JSON_HEADERS);
    res.end(
      JSON.stringify({
        status: "ok",
        service: "frontend-proxy",
        backend: BACKEND_BASE_URL,
      }),
    );
    return;
  }

  res.writeHead(404, JSON_HEADERS);
  res.end(JSON.stringify({ detail: "Route not found." }));
});

server.listen(PROXY_PORT, () => {
  console.log(
    `Proxy server listening on http://127.0.0.1:${PROXY_PORT} (backend: ${BACKEND_BASE_URL})`,
  );
});
