import * as Task from "../task";

type MainModule = import("@vivliostyle/lcms/lib/lcms.js").MainModule;
type Profile = import("@vivliostyle/lcms/lib/lcms.js").Profile;
type Transform = import("@vivliostyle/lcms/lib/lcms.js").Transform;

let lcms: MainModule | null = null;

export function initLcms(): Task.Result<boolean> {
  if (lcms !== null) {
    return Task.newResult(true);
  }
  const frame: Task.Frame<boolean> = Task.newFrame("initLcms");
  const continuation = frame.suspend();
  (
    import("@vivliostyle/lcms/lib/lcms.js") as Promise<{
      default: (opts?: unknown) => Promise<MainModule>;
    }>
  )
    .then((mod) => mod.default())
    .then((module) => {
      lcms = module;
      continuation.schedule(true);
    });
  return frame.result();
}

export function getLcms(): MainModule {
  return lcms!;
}

// Built-in profile cache
let srgbProfile: Profile | null = null;
let labProfile: Profile | null = null;
let oklabProfile: Profile | null = null;
let xyzProfile: Profile | null = null;

export function getSrgbProfile(): Profile {
  if (srgbProfile === null) {
    const p = lcms!.createSRGBProfile();
    if (p === null) {
      throw new Error("Failed to create sRGB profile");
    }
    srgbProfile = p;
  }
  return srgbProfile;
}

export function getLabProfile(): Profile {
  if (labProfile === null) {
    const p = lcms!.createLab4Profile();
    if (p === null) {
      throw new Error("Failed to create Lab profile");
    }
    labProfile = p;
  }
  return labProfile;
}

export function getOklabProfile(): Profile {
  if (oklabProfile === null) {
    const p = lcms!.createOkLabProfile();
    if (p === null) {
      throw new Error("Failed to create OKLab profile");
    }
    oklabProfile = p;
  }
  return oklabProfile;
}

export function getXyzProfile(): Profile {
  if (xyzProfile === null) {
    const p = lcms!.createXYZProfile();
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
  const t = lcms!.createTransform(
    inputProfile,
    inputFormat,
    outputProfile,
    outputFormat,
    lcms!.INTENT_PERCEPTUAL,
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
  return transformColor(
    [r, g, b],
    getSrgbProfile(),
    lcms!.TYPE_RGB_DBL,
    getLabProfile(),
    lcms!.TYPE_Lab_DBL,
    "srgb->lab",
  );
}

export function labToSrgb(L: number, a: number, b: number): number[] {
  return transformColor(
    [L, a, b],
    getLabProfile(),
    lcms!.TYPE_Lab_DBL,
    getSrgbProfile(),
    lcms!.TYPE_RGB_DBL,
    "lab->srgb",
  );
}

export function oklabToSrgb(L: number, a: number, b: number): number[] {
  return transformColor(
    [L, a, b],
    getOklabProfile(),
    lcms!.TYPE_OKLAB_DBL,
    getSrgbProfile(),
    lcms!.TYPE_RGB_DBL,
    "oklab->srgb",
  );
}

export function srgbToOklab(r: number, g: number, b: number): number[] {
  return transformColor(
    [r, g, b],
    getSrgbProfile(),
    lcms!.TYPE_RGB_DBL,
    getOklabProfile(),
    lcms!.TYPE_OKLAB_DBL,
    "srgb->oklab",
  );
}

export function xyzToSrgb(x: number, y: number, z: number): number[] {
  return transformColor(
    [x, y, z],
    getXyzProfile(),
    lcms!.TYPE_XYZ_DBL,
    getSrgbProfile(),
    lcms!.TYPE_RGB_DBL,
    "xyz->srgb",
  );
}

export function srgbToXyz(r: number, g: number, b: number): number[] {
  return transformColor(
    [r, g, b],
    getSrgbProfile(),
    lcms!.TYPE_RGB_DBL,
    getXyzProfile(),
    lcms!.TYPE_XYZ_DBL,
    "srgb->xyz",
  );
}

// ICC profile utilities

export function openProfileFromMemory(data: Uint8Array): Profile {
  const p = lcms!.openProfileFromMemory(Array.from(data));
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
  const sig = profile.colorSpace();

  if (sig === lcms!.cmsSigRgbData) {
    return { n: 3, alternate: "DeviceRGB" };
  }
  if (sig === lcms!.cmsSigCmykData) {
    return { n: 4, alternate: "DeviceCMYK" };
  }
  if (sig === lcms!.cmsSigGrayData) {
    return { n: 1, alternate: "DeviceGray" };
  }
  if (sig === lcms!.cmsSigLabData) {
    return { n: 3, alternate: "Lab" };
  }
  if (sig === lcms!.cmsSigXYZData) {
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
