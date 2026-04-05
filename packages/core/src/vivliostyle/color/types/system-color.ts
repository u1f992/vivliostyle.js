import type {
  CssIdentAccentColor,
  CssIdentAccentColorText,
  CssIdentActiveText,
  CssIdentButtonBorder,
  CssIdentButtonFace,
  CssIdentButtonText,
  CssIdentCanvas,
  CssIdentCanvasText,
  CssIdentField,
  CssIdentFieldText,
  CssIdentGrayText,
  CssIdentHighlight,
  CssIdentHighlightText,
  CssIdentLinkText,
  CssIdentMark,
  CssIdentMarkText,
  CssIdentSelectedItem,
  CssIdentSelectedItemText,
  CssIdentVisitedText,
} from "../css-color";

/**
 * @see https://www.w3.org/TR/2026/CRD-css-color-4-20260331/#typedef-system-color
 */
export type SystemColor =
  | CssIdentAccentColor
  | CssIdentAccentColorText
  | CssIdentActiveText
  | CssIdentButtonBorder
  | CssIdentButtonFace
  | CssIdentButtonText
  | CssIdentCanvas
  | CssIdentCanvasText
  | CssIdentField
  | CssIdentFieldText
  | CssIdentGrayText
  | CssIdentHighlight
  | CssIdentHighlightText
  | CssIdentLinkText
  | CssIdentMark
  | CssIdentMarkText
  | CssIdentSelectedItem
  | CssIdentSelectedItemText
  | CssIdentVisitedText;
