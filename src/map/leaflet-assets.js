// Loads Leaflet, its stylesheet and its default marker images for code that needs
// them without going through `map.js` (the location field in the point dialog, which
// can be opened from the Points list). Importing this module is the whole API.
//
// Two things would otherwise go wrong:
// - wc-location-field finds Leaflet through the global `L`, which Leaflet sets when it
//   loads. Without it the component fetches Leaflet and its CSS from unpkg.
// - Leaflet guesses where its marker images live from a CSS rule, which fails once the
//   files are bundled: the request falls through to index.html and the pin is invisible.

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// A string here stops Leaflet prefixing (or detecting) a path; the URLs are complete.
L.Icon.Default.imagePath = "";
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });
