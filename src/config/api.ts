import { REACT_NATIVE_API_URL } from '@env';

// ORDS module root, e.g. http://apps.nti-skt.net:8080/ords/sktntidev —
// axiosInstance (auth) uses it directly.
export const API_BASE_URL = REACT_NATIVE_API_URL.replace(/\/+$/, '');

// The `skt` REST module (skt_header, skt_view, skt_master_pekerja, ...).
export const SKT_API_URL = `${API_BASE_URL}/skt`;
