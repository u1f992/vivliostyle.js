import type {
  CssIdentAliceblue,
  CssIdentAntiquewhite,
  CssIdentAqua,
  CssIdentAquamarine,
  CssIdentAzure,
  CssIdentBeige,
  CssIdentBisque,
  CssIdentBlack,
  CssIdentBlanchedalmond,
  CssIdentBlue,
  CssIdentBlueviolet,
  CssIdentBrown,
  CssIdentBurlywood,
  CssIdentCadetblue,
  CssIdentChartreuse,
  CssIdentChocolate,
  CssIdentCoral,
  CssIdentCornflowerblue,
  CssIdentCornsilk,
  CssIdentCrimson,
  CssIdentCyan,
  CssIdentDarkblue,
  CssIdentDarkcyan,
  CssIdentDarkgoldenrod,
  CssIdentDarkgray,
  CssIdentDarkgreen,
  CssIdentDarkgrey,
  CssIdentDarkkhaki,
  CssIdentDarkmagenta,
  CssIdentDarkolivegreen,
  CssIdentDarkorange,
  CssIdentDarkorchid,
  CssIdentDarkred,
  CssIdentDarksalmon,
  CssIdentDarkseagreen,
  CssIdentDarkslateblue,
  CssIdentDarkslategray,
  CssIdentDarkslategrey,
  CssIdentDarkturquoise,
  CssIdentDarkviolet,
  CssIdentDeeppink,
  CssIdentDeepskyblue,
  CssIdentDimgray,
  CssIdentDimgrey,
  CssIdentDodgerblue,
  CssIdentFirebrick,
  CssIdentFloralwhite,
  CssIdentForestgreen,
  CssIdentFuchsia,
  CssIdentGainsboro,
  CssIdentGhostwhite,
  CssIdentGold,
  CssIdentGoldenrod,
  CssIdentGray,
  CssIdentGreen,
  CssIdentGreenyellow,
  CssIdentGrey,
  CssIdentHoneydew,
  CssIdentHotpink,
  CssIdentIndianred,
  CssIdentIndigo,
  CssIdentIvory,
  CssIdentKhaki,
  CssIdentLavender,
  CssIdentLavenderblush,
  CssIdentLawngreen,
  CssIdentLemonchiffon,
  CssIdentLightblue,
  CssIdentLightcoral,
  CssIdentLightcyan,
  CssIdentLightgoldenrodyellow,
  CssIdentLightgray,
  CssIdentLightgreen,
  CssIdentLightgrey,
  CssIdentLightpink,
  CssIdentLightsalmon,
  CssIdentLightseagreen,
  CssIdentLightskyblue,
  CssIdentLightslategray,
  CssIdentLightslategrey,
  CssIdentLightsteelblue,
  CssIdentLightyellow,
  CssIdentLime,
  CssIdentLimegreen,
  CssIdentLinen,
  CssIdentMagenta,
  CssIdentMaroon,
  CssIdentMediumaquamarine,
  CssIdentMediumblue,
  CssIdentMediumorchid,
  CssIdentMediumpurple,
  CssIdentMediumseagreen,
  CssIdentMediumslateblue,
  CssIdentMediumspringgreen,
  CssIdentMediumturquoise,
  CssIdentMediumvioletred,
  CssIdentMidnightblue,
  CssIdentMintcream,
  CssIdentMistyrose,
  CssIdentMoccasin,
  CssIdentNavajowhite,
  CssIdentNavy,
  CssIdentOldlace,
  CssIdentOlive,
  CssIdentOlivedrab,
  CssIdentOrange,
  CssIdentOrangered,
  CssIdentOrchid,
  CssIdentPalegoldenrod,
  CssIdentPalegreen,
  CssIdentPaleturquoise,
  CssIdentPalevioletred,
  CssIdentPapayawhip,
  CssIdentPeachpuff,
  CssIdentPeru,
  CssIdentPink,
  CssIdentPlum,
  CssIdentPowderblue,
  CssIdentPurple,
  CssIdentRebeccapurple,
  CssIdentRed,
  CssIdentRosybrown,
  CssIdentRoyalblue,
  CssIdentSaddlebrown,
  CssIdentSalmon,
  CssIdentSandybrown,
  CssIdentSeagreen,
  CssIdentSeashell,
  CssIdentSienna,
  CssIdentSilver,
  CssIdentSkyblue,
  CssIdentSlateblue,
  CssIdentSlategray,
  CssIdentSlategrey,
  CssIdentSnow,
  CssIdentSpringgreen,
  CssIdentSteelblue,
  CssIdentTan,
  CssIdentTeal,
  CssIdentThistle,
  CssIdentTomato,
  CssIdentTurquoise,
  CssIdentViolet,
  CssIdentWheat,
  CssIdentWhite,
  CssIdentWhitesmoke,
  CssIdentYellow,
  CssIdentYellowgreen,
} from "../../css-color";

/**
 * @see https://www.w3.org/TR/2026/WD-css-color-5-20260325/#typedef-color-base
 *
 * ```plaintext
 * <color-base> = <hex-color> | <color-function> | <named-color> | <color-mix()> | transparent
 * ```
 */
export type NamedColor =
  | CssIdentAliceblue
  | CssIdentAntiquewhite
  | CssIdentAqua
  | CssIdentAquamarine
  | CssIdentAzure
  | CssIdentBeige
  | CssIdentBisque
  | CssIdentBlack
  | CssIdentBlanchedalmond
  | CssIdentBlue
  | CssIdentBlueviolet
  | CssIdentBrown
  | CssIdentBurlywood
  | CssIdentCadetblue
  | CssIdentChartreuse
  | CssIdentChocolate
  | CssIdentCoral
  | CssIdentCornflowerblue
  | CssIdentCornsilk
  | CssIdentCrimson
  | CssIdentCyan
  | CssIdentDarkblue
  | CssIdentDarkcyan
  | CssIdentDarkgoldenrod
  | CssIdentDarkgray
  | CssIdentDarkgreen
  | CssIdentDarkgrey
  | CssIdentDarkkhaki
  | CssIdentDarkmagenta
  | CssIdentDarkolivegreen
  | CssIdentDarkorange
  | CssIdentDarkorchid
  | CssIdentDarkred
  | CssIdentDarksalmon
  | CssIdentDarkseagreen
  | CssIdentDarkslateblue
  | CssIdentDarkslategray
  | CssIdentDarkslategrey
  | CssIdentDarkturquoise
  | CssIdentDarkviolet
  | CssIdentDeeppink
  | CssIdentDeepskyblue
  | CssIdentDimgray
  | CssIdentDimgrey
  | CssIdentDodgerblue
  | CssIdentFirebrick
  | CssIdentFloralwhite
  | CssIdentForestgreen
  | CssIdentFuchsia
  | CssIdentGainsboro
  | CssIdentGhostwhite
  | CssIdentGold
  | CssIdentGoldenrod
  | CssIdentGray
  | CssIdentGreen
  | CssIdentGreenyellow
  | CssIdentGrey
  | CssIdentHoneydew
  | CssIdentHotpink
  | CssIdentIndianred
  | CssIdentIndigo
  | CssIdentIvory
  | CssIdentKhaki
  | CssIdentLavender
  | CssIdentLavenderblush
  | CssIdentLawngreen
  | CssIdentLemonchiffon
  | CssIdentLightblue
  | CssIdentLightcoral
  | CssIdentLightcyan
  | CssIdentLightgoldenrodyellow
  | CssIdentLightgray
  | CssIdentLightgreen
  | CssIdentLightgrey
  | CssIdentLightpink
  | CssIdentLightsalmon
  | CssIdentLightseagreen
  | CssIdentLightskyblue
  | CssIdentLightslategray
  | CssIdentLightslategrey
  | CssIdentLightsteelblue
  | CssIdentLightyellow
  | CssIdentLime
  | CssIdentLimegreen
  | CssIdentLinen
  | CssIdentMagenta
  | CssIdentMaroon
  | CssIdentMediumaquamarine
  | CssIdentMediumblue
  | CssIdentMediumorchid
  | CssIdentMediumpurple
  | CssIdentMediumseagreen
  | CssIdentMediumslateblue
  | CssIdentMediumspringgreen
  | CssIdentMediumturquoise
  | CssIdentMediumvioletred
  | CssIdentMidnightblue
  | CssIdentMintcream
  | CssIdentMistyrose
  | CssIdentMoccasin
  | CssIdentNavajowhite
  | CssIdentNavy
  | CssIdentOldlace
  | CssIdentOlive
  | CssIdentOlivedrab
  | CssIdentOrange
  | CssIdentOrangered
  | CssIdentOrchid
  | CssIdentPalegoldenrod
  | CssIdentPalegreen
  | CssIdentPaleturquoise
  | CssIdentPalevioletred
  | CssIdentPapayawhip
  | CssIdentPeachpuff
  | CssIdentPeru
  | CssIdentPink
  | CssIdentPlum
  | CssIdentPowderblue
  | CssIdentPurple
  | CssIdentRebeccapurple
  | CssIdentRed
  | CssIdentRosybrown
  | CssIdentRoyalblue
  | CssIdentSaddlebrown
  | CssIdentSalmon
  | CssIdentSandybrown
  | CssIdentSeagreen
  | CssIdentSeashell
  | CssIdentSienna
  | CssIdentSilver
  | CssIdentSkyblue
  | CssIdentSlateblue
  | CssIdentSlategray
  | CssIdentSlategrey
  | CssIdentSnow
  | CssIdentSpringgreen
  | CssIdentSteelblue
  | CssIdentTan
  | CssIdentTeal
  | CssIdentThistle
  | CssIdentTomato
  | CssIdentTurquoise
  | CssIdentViolet
  | CssIdentWheat
  | CssIdentWhite
  | CssIdentWhitesmoke
  | CssIdentYellow
  | CssIdentYellowgreen;
