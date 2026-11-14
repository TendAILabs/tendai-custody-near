// Device and sensor APIs this app does not use. clipboard-write stays on for
// this origin: the landing copy control and the near-connect sandbox both call
// clipboard.writeText on the page.
const DENIED = [
  "accelerometer",
  "ambient-light-sensor",
  "bluetooth",
  "browsing-topics",
  "camera",
  "display-capture",
  "geolocation",
  "gyroscope",
  "hid",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "screen-wake-lock",
  "serial",
  "usb",
  "xr-spatial-tracking",
] as const;

export function permissionsPolicy(): string {
  return [...DENIED.map((name) => `${name}=()`), "clipboard-write=(self)"].join(", ");
}

// near-connect opens the wallet with window.open and polls the handle's closed
// flag. COOP same-origin makes that flag true for a cross-origin wallet window,
// so the connect flow treats the popup as already dismissed. same-origin-allow-popups
// keeps the handle when the wallet page does not set its own COOP.
export const CROSS_ORIGIN_OPENER_POLICY = "same-origin-allow-popups";
