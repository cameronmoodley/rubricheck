/**
 * API base URL from env. When set (e.g. https://api-demo.rubri-check.com),
 * all API calls use this origin. When empty, relative URLs are used (same origin).
 */
export const API_BASE = (import.meta.env.VITE_API_URL as string)?.trim() || "";

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE.replace(/\/$/, "")}${p}` : p;
}
