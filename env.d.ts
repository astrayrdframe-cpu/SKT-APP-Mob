declare module '@env' {
  export const REACT_NATIVE_API_URL: string;
  export const API_TIMEOUT: string;
  // 'true' (dev builds only) routes API calls through localhost:8080 — see src/config/api.ts.
  export const REACT_NATIVE_USE_USB_TUNNEL: string | undefined;
}