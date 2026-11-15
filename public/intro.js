/*
 * Turns on Vybe's launch intro before anything paints: index.html's #intro, drawn by src/intro.css,
 * ended by src/intro.ts.
 * A script rather than a class written into the page: the miniplayer's window
 * (?window=pip) loads the same page and never shows it, and Vybe's page allows no inline scripts.
 */
(function () {
  "use strict";
  if (new URLSearchParams(window.location.search).get("window") === "pip") return;
  var html = document.documentElement;
  // intro: the intro shows. intro-wait: the app stays hidden under it until src/intro.ts hands over.
  // intro-glass: the page is see-through, for the window's glass, until the intro has played.
  html.classList.add("intro", "intro-wait", "intro-glass");
  try {
    var audioUrl = new URL("opening.mp3", window.location.href).href;
    var audio = new Audio(audioUrl);
    window.__openingAudio = audio;
    var p = audio.play();
    if (p && p.catch) {
      p.catch(function () {});
    }
  } catch (e) {}
})();
