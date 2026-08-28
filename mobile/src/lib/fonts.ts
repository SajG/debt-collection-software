import { useFonts } from "expo-font";

// Brand fonts, self-hosted from mobile/assets/fonts/. Rebase with
// `npm run fonts:fetch` at the repo root.
//
// The two family names mirror the CSS variables the web side uses
// (--font-body / --font-display) so shared components can reference
// the same family string.

export function useBrandFonts() {
  return useFonts({
    Inter: require("../../assets/fonts/InterVariable.ttf"),
    "Inter Tight": require("../../assets/fonts/InterTight-Variable.ttf"),
  });
}

export const FONT_BODY = "Inter";
export const FONT_DISPLAY = "Inter Tight";
