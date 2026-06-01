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

/**
 * Transfère la requête vers le backend Django (corps JSON pour POST/PUT/PATCH).
 * @param {object} options
 * @param {string} [options.method="POST"]
 * @param {string} options.upstreamPath — chemin sur le backend, ex. /api/auth/login/
 * @param {boolean} [options.forwardBearer=false] — reprend Authorization: Bearer … du client
 */
const proxyToDjango = async (req, res, options) => {
  const { method = "POST", upstreamPath, forwardBearer = false } = options;
  try {
    const headers = {};
    const hasBody = method !== "GET" && method !== "HEAD";
    if (hasBody) {
      headers["Content-Type"] = "application/json";
    }
    if (forwardBearer && req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }
    const init = {
      method,
      headers,
      ...(hasBody ? { body: await readBody(req) } : {}),
    };
    const upstream = await fetch(`${BACKEND_BASE_URL}${upstreamPath}`, init);
    const payload = await upstream.text();
    res.writeHead(upstream.status, JSON_HEADERS);
    res.end(payload);
  } catch (error) {
    res.writeHead(502, JSON_HEADERS);
    res.end(
      JSON.stringify({
        detail: "Proxy error while reaching backend.",
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
    await proxyToDjango(req, res, { upstreamPath: "/api/auth/login/" });
    return;
  }

  if (req.method === "POST" && req.url === "/api/register") {
    await proxyToDjango(req, res, { upstreamPath: "/api/auth/register/" });
    return;
  }

  if (req.method === "POST" && req.url === "/api/request-otp") {
    await proxyToDjango(req, res, { upstreamPath: "/api/auth/request-otp/" });
    return;
  }

  if (req.method === "POST" && req.url === "/api/verify-otp") {
    await proxyToDjango(req, res, { upstreamPath: "/api/auth/verify-otp/" });
    return;
  }

  if (req.method === "POST" && req.url === "/api/resend-otp") {
    await proxyToDjango(req, res, { upstreamPath: "/api/auth/resend-otp/" });
    return;
  }

  if (req.method === "POST" && req.url === "/api/refresh") {
    await proxyToDjango(req, res, { upstreamPath: "/api/auth/refresh/" });
    return;
  }

  if (req.method === "GET" && req.url === "/api/me") {
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: "/api/auth/me/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/wallet/deposit/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/wallet/deposit/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/wallet/withdrawal/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/wallet/withdrawal/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/wallet/transactions/") {
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: "/api/wallet/transactions/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/tontine/") {
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: "/api/tontine/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/tontine/recruiting/") {
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: "/api/tontine/recruiting/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/tontine/detail")) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: `/api/tontine/detail/${query}`,
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tontine/create/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/create/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tontine/regles/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/regles/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tontine/invitations/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/invitations/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/tontine/invitations/mine/") {
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: "/api/tontine/invitations/mine/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/tontine/invitations/preview")) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: `/api/tontine/invitations/preview/${query}`,
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tontine/invitations/accept/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/invitations/accept/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tontine/invitations/refuse/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/invitations/refuse/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tontine/ordre/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/ordre/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tontine/cotiser/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/cotiser/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tontine/tours/demarrer/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/tours/demarrer/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tontine/penalites/attribuer/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/penalites/attribuer/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tontine/tours/changer/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/tours/changer/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/tontine/chat/") && !req.url.startsWith("/api/tontine/chat/send")) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: `/api/tontine/chat/${query}`,
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/tontine/chat/send/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/chat/send/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/savings/") {
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: "/api/savings/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/savings/archived/") {
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: "/api/savings/archived/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/savings/create/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/savings/create/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/savings/detail")) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: `/api/savings/detail/${query}`,
      forwardBearer: true,
    });
    return;
  }


  if (req.method === "POST" && req.url === "/api/savings/deposit/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/savings/deposit/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/savings/withdraw/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/savings/withdraw/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/savings/archive/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/savings/archive/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/savings/delete/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/savings/delete/",
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/savings/transactions")) {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    await proxyToDjango(req, res, {
      method: "GET",
      upstreamPath: `/api/savings/transactions/${query}`,
      forwardBearer: true,
    });
    return;
  }

  if (req.method === "PATCH" && req.url === "/api/savings/update/") {
    await proxyToDjango(req, res, {
      method: "PATCH",
      upstreamPath: "/api/savings/update/",
      forwardBearer: true,
    });
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
