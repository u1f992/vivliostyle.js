type MainModule = import("@vivliostyle/lcms/lib/lcms.js").MainModule;
type Profile = import("@vivliostyle/lcms/lib/lcms.js").Profile;
type Transform = import("@vivliostyle/lcms/lib/lcms.js").Transform;

let lcmsModule: MainModule | null = null;

export async function initLcms(): Promise<MainModule> {
  if (lcmsModule !== null) {
    return lcmsModule;
  }
  try {
    // Dynamic import path constructed at runtime to prevent bundlers from
    // resolving it statically. lcms is an optional dependency.
    const modulePath = ["@vivliostyle", "lcms", "lib", "lcms.js"].join("/");
    const mod = await (Function(
      "p",
      "return import(p)",
    )(modulePath) as Promise<{
      default: (opts?: unknown) => Promise<MainModule>;
    }>);
    lcmsModule = await mod.default();
  } catch {
    // lcms not available — non-RGB color conversions will fall back
  }
  return lcmsModule!;
}

export function isLcmsInitialized(): boolean {
  return lcmsModule !== null;
}

export function getLcms(): MainModule {
  if (lcmsModule === null) {
    throw new Error("lcms not initialized. Call initLcms() first.");
  }
  return lcmsModule;
}

// Built-in profile cache
let srgbProfile: Profile | null = null;
let labProfile: Profile | null = null;
let oklabProfile: Profile | null = null;
let xyzProfile: Profile | null = null;

export function getSrgbProfile(): Profile {
  if (srgbProfile === null) {
    const p = getLcms().createSRGBProfile();
    if (p === null) {
      throw new Error("Failed to create sRGB profile");
    }
    srgbProfile = p;
  }
  return srgbProfile;
}

export function getLabProfile(): Profile {
  if (labProfile === null) {
    const p = getLcms().createLab4Profile();
    if (p === null) {
      throw new Error("Failed to create Lab profile");
    }
    labProfile = p;
  }
  return labProfile;
}

export function getOklabProfile(): Profile {
  if (oklabProfile === null) {
    const p = getLcms().createOkLabProfile();
    if (p === null) {
      throw new Error("Failed to create OKLab profile");
    }
    oklabProfile = p;
  }
  return oklabProfile;
}

export function getXyzProfile(): Profile {
  if (xyzProfile === null) {
    const p = getLcms().createXYZProfile();
    if (p === null) {
      throw new Error("Failed to create XYZ profile");
    }
    xyzProfile = p;
  }
  return xyzProfile;
}

// Transform cache
const transformCache = new Map<string, Transform>();

function getCachedTransform(
  inputProfile: Profile,
  inputFormat: number,
  outputProfile: Profile,
  outputFormat: number,
  cacheKey: string,
): Transform {
  const cached = transformCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const lcms = getLcms();
  const t = lcms.createTransform(
    inputProfile,
    inputFormat,
    outputProfile,
    outputFormat,
    lcms.INTENT_PERCEPTUAL,
    0,
  );
  if (t === null) {
    throw new Error(`Failed to create transform: ${cacheKey}`);
  }
  transformCache.set(cacheKey, t);
  return t;
}

export function transformColor(
  input: number[],
  inputProfile: Profile,
  inputFormat: number,
  outputProfile: Profile,
  outputFormat: number,
  cacheKey: string,
): number[] {
  const t = getCachedTransform(
    inputProfile,
    inputFormat,
    outputProfile,
    outputFormat,
    cacheKey,
  );
  return t.doTransform(input) as number[];
}

// Shortcut functions

export function srgbToLab(r: number, g: number, b: number): number[] {
  const lcms = getLcms();
  return transformColor(
    [r, g, b],
    getSrgbProfile(),
    lcms.TYPE_RGB_DBL,
    getLabProfile(),
    lcms.TYPE_Lab_DBL,
    "srgb->lab",
  );
}

export function labToSrgb(L: number, a: number, b: number): number[] {
  const lcms = getLcms();
  return transformColor(
    [L, a, b],
    getLabProfile(),
    lcms.TYPE_Lab_DBL,
    getSrgbProfile(),
    lcms.TYPE_RGB_DBL,
    "lab->srgb",
  );
}

export function oklabToSrgb(L: number, a: number, b: number): number[] {
  const lcms = getLcms();
  return transformColor(
    [L, a, b],
    getOklabProfile(),
    lcms.TYPE_OKLAB_DBL,
    getSrgbProfile(),
    lcms.TYPE_RGB_DBL,
    "oklab->srgb",
  );
}

export function srgbToOklab(r: number, g: number, b: number): number[] {
  const lcms = getLcms();
  return transformColor(
    [r, g, b],
    getSrgbProfile(),
    lcms.TYPE_RGB_DBL,
    getOklabProfile(),
    lcms.TYPE_OKLAB_DBL,
    "srgb->oklab",
  );
}

export function xyzToSrgb(x: number, y: number, z: number): number[] {
  const lcms = getLcms();
  return transformColor(
    [x, y, z],
    getXyzProfile(),
    lcms.TYPE_XYZ_DBL,
    getSrgbProfile(),
    lcms.TYPE_RGB_DBL,
    "xyz->srgb",
  );
}

export function srgbToXyz(r: number, g: number, b: number): number[] {
  const lcms = getLcms();
  return transformColor(
    [r, g, b],
    getSrgbProfile(),
    lcms.TYPE_RGB_DBL,
    getXyzProfile(),
    lcms.TYPE_XYZ_DBL,
    "srgb->xyz",
  );
}

// ICC profile utilities

export function openProfileFromMemory(data: Uint8Array): Profile {
  const lcms = getLcms();
  const p = lcms.openProfileFromMemory(Array.from(data));
  if (p === null) {
    throw new Error("Failed to open ICC profile from memory");
  }
  return p;
}

export interface IccProfileInfo {
  n: number;
  alternate: "DeviceRGB" | "DeviceCMYK" | "DeviceGray" | "Lab" | null;
}

export function getIccProfileInfo(profile: Profile): IccProfileInfo {
  const lcms = getLcms();
  const sig = profile.colorSpace();

  if (sig === lcms.cmsSigRgbData) {
    return { n: 3, alternate: "DeviceRGB" };
  }
  if (sig === lcms.cmsSigCmykData) {
    return { n: 4, alternate: "DeviceCMYK" };
  }
  if (sig === lcms.cmsSigGrayData) {
    return { n: 1, alternate: "DeviceGray" };
  }
  if (sig === lcms.cmsSigLabData) {
    return { n: 3, alternate: "Lab" };
  }
  if (sig === lcms.cmsSigXYZData) {
    return { n: 3, alternate: "Lab" };
  }

  // Multi-channel (2CLR-FCLR): extract N from signature
  // Signatures are 4-char ASCII: '2CLR' (0x32434C52) through 'FCLR'
  const firstByte = (sig >> 24) & 0xff;
  if (firstByte >= 0x32 && firstByte <= 0x46) {
    // '2' through 'F' = 2 through 15 channels
    const n = firstByte <= 0x39 ? firstByte - 0x30 : firstByte - 0x41 + 10;
    return { n, alternate: null };
  }

  return { n: 0, alternate: null };
}
