import { REACT_NATIVE_API_URL, REACT_NATIVE_USE_USB_TUNNEL } from '@env';

// DEV ONLY — when REACT_NATIVE_USE_USB_TUNNEL=true is set in your local
// .env (git-ignored, so it never reaches anyone else) AND this is a
// __DEV__ build, every API call goes to http://localhost:8080 on the
// device instead of the real ORDS host. Use it when the device can't reach
// the ORDS server directly (e.g. a phone on the PC's hotspot while the PC
// reaches ORDS over VPN): run a TCP forwarder on the PC from
// localhost:8080 to apps.nti-skt.net:8080, then
// `adb reverse tcp:8080 tcp:8080`. Unset/false (the default for everyone
// else) and release builds always use REACT_NATIVE_API_URL.
const USE_USB_TUNNEL = REACT_NATIVE_USE_USB_TUNNEL === 'true';

const DEV_TUNNEL_API_URL = 'http://localhost:8080/ords/sktntidev';

// ORDS module root, e.g. http://apps.nti-skt.net:8080/ords/sktntidev —
// axiosInstance (auth) uses it directly.
export const API_BASE_URL = (__DEV__ && USE_USB_TUNNEL ? DEV_TUNNEL_API_URL : REACT_NATIVE_API_URL).replace(
  /\/+$/,
  ''
);

// The `skt` REST module (skt_header, skt_view, skt_master_pekerja, ...).
export const SKT_API_URL = `${API_BASE_URL}/skt`;
