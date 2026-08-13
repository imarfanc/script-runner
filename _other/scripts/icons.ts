import {
  faBolt,
  faEarthAmericas,
  faFaceSmile,
  faFont,
  faGlobe,
  faPowerOff,
  faSatelliteDish,
  faTerminal,
  faWindowMaximize,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

/** Font Awesome code points rendered by the configured Nerd Font. */
function glyph(icon: IconDefinition): string {
  return String.fromCodePoint(Number.parseInt(icon.icon[3], 16));
}

export const icons = {
  online: glyph(faGlobe),
  mode: glyph(faBolt),
  text: glyph(faFont),
  emoji: glyph(faFaceSmile),
  terminal: glyph(faTerminal),
  browser: glyph(faEarthAmericas),
  helium: glyph(faSatelliteDish),
  app: glyph(faWindowMaximize),
  exit: glyph(faPowerOff),
} as const;
