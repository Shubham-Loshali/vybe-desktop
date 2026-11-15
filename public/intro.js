/*
 * Turns on Vybe's launch intro before anything paints: index.html's #intro, drawn by src/intro.css,
 * ended by src/intro.ts. Adapted from a third-party startup loader
 * under the Apache License, Version 2.0 (see NOTICE), and changed:
 * http://www.apache.org/licenses/LICENSE-2.0
 * A script rather than a class written into the page, as theirs is: the miniplayer's window
 * (?window=pip) loads the same page and never shows it, and Vybe's page allows no inline scripts.
 */
(function () {
  "use strict";
  if (new URLSearchParams(window.location.search).get("window") === "pip") return;
  var html = document.documentElement;
  // intro: the intro shows. intro-wait: the app stays hidden under it until src/intro.ts hands over.
  // intro-glass: the page is see-through, for the window's glass, until the intro has played.
  html.classList.add("intro", "intro-wait", "intro-glass");
})();
