// Web Awesome (the free, MIT-licensed package), imported explicitly rather than through the
// autoloader so the bundle contains only the components the app uses. To use another
// component, add its import here.

import { registerIconLibrary } from "@awesome.me/webawesome/dist/components/icon/library.js";
import "@awesome.me/webawesome/dist/styles/webawesome.css";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/drawer/drawer.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/switch/switch.js";
import "@awesome.me/webawesome/dist/components/page/page.js";
import "@awesome.me/webawesome/dist/components/qr-code/qr-code.js";
import "@awesome.me/webawesome/dist/components/spinner/spinner.js";
import "@awesome.me/webawesome/dist/components/textarea/textarea.js";

// Icons are bundled from src/icons (Font Awesome Free, CC BY 4.0) instead of being fetched
// from Font Awesome's CDN at run time. That keeps every request on our own origin (no
// third party sees who opened the map) and keeps the security policy small. To use another
// icon, copy its SVG from Font Awesome Free's `svgs/solid` folder into src/icons.
const icons = import.meta.glob("./icons/*.svg", { eager: true, query: "?url", import: "default" });

registerIconLibrary("default", {
  resolver: (name) => {
    const url = icons[`./icons/${name}.svg`];
    return typeof url === "string" ? url : "";
  },
});
