import "./web-awesome.js";
import "./styles/app.css";

const outlet = document.getElementById("main-content");
const announcer = document.getElementById("announcer");
if (!outlet || !announcer)
  throw new Error("index.html is missing #main-content or #announcer.");

// A normal build always signs people in (boot/secure.js). Only a build made with
// VITE_LOCAL_DATA=true uses the local, sign-in-free start-up, for development and the
// end-to-end tests. Vite replaces the condition with a constant, so the other start-up
// is left out of a normal build altogether.
const boot =
  import.meta.env.VITE_LOCAL_DATA === "true"
    ? import("./boot/local.js")
    : import("./boot/secure.js");

boot.then(({ start }) => start({ outlet, announcer }));
