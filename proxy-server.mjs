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

  if (req.method === "POST" && req.url === "/api/tontine/invitations/") {
    await proxyToDjango(req, res, {
      upstreamPath: "/api/tontine/invitations/",
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
