function integer(env, key, fallback, min, max) {
  const n = Number(env[key] ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${key}`);
  return n;
}
export function loadConfig(env = process.env) {
  const mode = env.DATA_MODE || 'demo';
  if (!['demo','sap'].includes(mode)) throw new Error('DATA_MODE must be demo or sap');
  const host = env.HOST || '127.0.0.1';
  if (!['127.0.0.1','localhost','::1'].includes(host) && env.AUTH_PROXY_CONFIRMED !== 'true')
    throw new Error('External binding requires an authenticated proxy and AUTH_PROXY_CONFIRMED=true');
  const config = { mode, host, port:integer(env,'PORT',3001,1,65535), pollMs:integer(env,'POLL_INTERVAL_MS',30000,10000,3600000),
    hours:integer(env,'LOOKBACK_HOURS',24,1,168), maxMessages:integer(env,'MAX_MESSAGES',1000,1,10000),
    maxPages:integer(env,'MAX_PAGES',20,1,100), timeout:integer(env,'REQUEST_TIMEOUT_MS',15000,100,60000), errorCacheMs:integer(env,'ERROR_CACHE_MS',60000,1000,3600000) };
  if (mode === 'sap') {
    for (const key of ['SAP_API_BASE_URL','SAP_TOKEN_URL','SAP_CLIENT_ID','SAP_CLIENT_SECRET'])
      if (!env[key]) throw new Error(`Missing ${key}`);
    for (const key of ['SAP_API_BASE_URL','SAP_TOKEN_URL']) {
      const u = new URL(env[key]);
      if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error(`Invalid HTTPS URL: ${key}`);
    }
    config.base = env.SAP_API_BASE_URL.replace(/\/?$/, '/');
    config.tokenUrl = env.SAP_TOKEN_URL; config.clientId = env.SAP_CLIENT_ID; config.clientSecret = env.SAP_CLIENT_SECRET;
  }
  return config;
}
