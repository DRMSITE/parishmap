// Decode an OpenStreetMap short link (osm.org/go/<code>) into the position it points at,
// following the algorithm OpenStreetMap documents for its short links. Used by
// import-plots.mjs. Each code character holds six bits, alternately longitude and
// latitude; "-" characters at the end adjust the zoom and carry no position.

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_~";

/**
 * @param {string} link A short link, or just its code.
 * @returns {{ lat: number, lng: number, zoom: number } | null} null if it is not a short link.
 */
export function decodeShortLink(link) {
  const code = link.trim().match(/\/go\/([^?#\s]+)/)?.[1] ?? link.trim();
  let x = 0;
  let y = 0;
  let bits = 0;
  let zoomOffset = 0;
  for (const char of code) {
    // "@" is how some places write "~" in the code.
    let value = ALPHABET.indexOf(char === "@" ? "~" : char);
    if (value < 0) {
      if (char !== "-") return null;
      zoomOffset -= 1;
      continue;
    }
    for (let i = 0; i < 3; i++) {
      x = x * 2 + ((value & 32) >> 5);
      value <<= 1;
      y = y * 2 + ((value & 32) >> 5);
      value <<= 1;
    }
    bits += 3;
  }
  if (bits === 0) return null;
  // Numbers (not bit shifts) because the values go up to 32 bits.
  const scale = 2 ** (32 - bits);
  return {
    lng: (x * scale * 360) / 2 ** 32 - 180,
    lat: (y * scale * 180) / 2 ** 32 - 90,
    zoom: bits - 8 - (((zoomOffset % 3) + 3) % 3),
  };
}
