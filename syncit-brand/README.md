# Syncit brand assets

Two interlocking rings — one mint over one white. The product bonds two
surfaces; the app bonds two sides of the business. Reads as an S on the
diagonal without being a literal letterform, and holds together down to 40px.

## Files

| File | Use |
|---|---|
| `icon.svg` | App icon, 512×512 artboard, dark |
| `adaptive-icon-foreground.svg` | Android adaptive foreground, scaled to the 66% safe zone |
| `icon-light.svg` | Light backgrounds, documents, letterheads |
| `icon-mono.svg` | Single colour via `currentColor` — PDF headers, notification icon, stamps |
| `favicon.svg` | Thicker strokes, tuned for 16–32px |
| `wordmark-dark.svg` | Horizontal lockup on Bond Green |
| `wordmark-light.svg` | Horizontal lockup, transparent background |

PNG exports sit alongside each SVG.

## Palette

| Token | Hex | Use |
|---|---|---|
| Bond | `#093D30` | Primary, headers, app bar |
| Kiln | `#12876C` | Interactive, focus rings, links |
| Set | `#3DDC97` | Accent, success, the sync mark |
| Cure | `#B96A00` | Awaiting approval, on hold |
| Fault | `#B42318` | Rejected, errors, credit block |
| Bench | `#F5F7F6` | Surfaces, cards |
| Ink | `#0B1D18` | Text |

## Type

Inter Tight for headings and numbers, Inter for body. Both free and variable.

Turn on tabular numerals (`font-feature-settings: "tnum"`) on every quantity,
rate and amount. Money that doesn't line up in a column is the loudest
"homemade" signal in a business app.

## Before shipping

The wordmark SVGs reference Inter Tight by font name. Open them in Figma with
the font installed and convert the text to outlines, or they'll fall back on
machines that don't have it.

## Clear space and minimum size

Clear space on all sides = the radius of one ring. Minimum size for the mark
alone is 24px; below that use `favicon.svg`, which has thicker strokes.
