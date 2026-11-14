import { HTTPException } from "hono/http-exception";

export function isLocalhostUri(uri: string) {
  if (!URL.canParse(uri)) return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(uri).hostname);
}

export function validateAppRedirects(uris: string[], allowLocalhost: boolean) {
  for (const uri of uris) {
    if (!URL.canParse(uri)) throw new HTTPException(400, { message: "Invalid redirect URI." });
    const url = new URL(uri);
    // Better Auth validates native-app schemes; this option only changes HTTP(S) policy.
    if (!["https:", "http:"].includes(url.protocol)) continue;
    if (url.username || url.password || url.hash) {
      throw new HTTPException(400, { message: "Redirect URIs must use HTTP(S), without credentials or fragments." });
    }
    if (isLocalhostUri(uri)) {
      if (!allowLocalhost) throw new HTTPException(400, { message: "Enable localhost redirects for testing, or remove localhost redirect and logout URIs." });
    } else if (url.protocol !== "https:") {
      throw new HTTPException(400, { message: "Redirect URIs must use HTTPS, except localhost when testing is enabled." });
    }
  }
}
