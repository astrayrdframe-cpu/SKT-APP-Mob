// src/services/serverTime.ts
//
// Tracks the offset between the device's clock and the backend's clock, so
// screens can show a time-of-day greeting ("Good Morning/Afternoon/Evening")
// based on the SERVER's time rather than whatever the phone's clock is set
// to (which may be wrong, or in a different timezone than the backend).
//
// There's no dedicated "what time is it" endpoint, so instead this reads
// the standard HTTP `Date` response header — present on every response —
// and keeps a running offset (serverTime - deviceTime). Any screen can then
// call getServerNow() to get a Date corrected for that offset. Until the
// first response arrives, the offset is 0 and getServerNow() just returns
// the device's own clock, which is a reasonable fallback.

let offsetMs = 0;

export function updateServerTimeFromHeader(dateHeader?: string | null): void {
  if (!dateHeader) return;
  const serverMs = Date.parse(dateHeader);
  if (Number.isNaN(serverMs)) return;
  offsetMs = serverMs - Date.now();
}

export function getServerNow(): Date {
  return new Date(Date.now() + offsetMs);
}
