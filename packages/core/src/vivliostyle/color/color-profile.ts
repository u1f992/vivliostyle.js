/**
 * @color-profile data structures and components descriptor parsing.
 * @see WORKNOTES.md for the extended components syntax.
 */

export type SrcDescriptor =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "device-cmyk" }
  | { readonly kind: "srgb" }
  | { readonly kind: "lab" };

/**
 * Form 1: <custom-ident>
 * Process color — unit vector at position, relative color syntax available.
 */
export interface ProcessColorComponent {
  readonly form: 1;
  readonly ident: string;
  readonly inkName: string;
  readonly fallback?: undefined;
}

/**
 * Form 1b: <custom-ident> <string>
 * Process color with explicit ink name, relative color syntax available.
 */
export interface ProcessColorNamedComponent {
  readonly form: "1b";
  readonly ident: string;
  readonly inkName: string;
  readonly fallback?: undefined;
}

/**
 * Form 2: <string> <number>+
 * Spot color, no relative color syntax.
 */
export interface SpotColorAnonymousComponent {
  readonly form: 2;
  readonly ident?: undefined;
  readonly inkName: string;
  readonly fallback: readonly number[];
}

/**
 * Form 3: <custom-ident> <string> <number>+
 * Spot color with relative color syntax available.
 */
export interface SpotColorNamedComponent {
  readonly form: 3;
  readonly ident: string;
  readonly inkName: string;
  readonly fallback: readonly number[];
}

export type ComponentEntry =
  | ProcessColorComponent
  | ProcessColorNamedComponent
  | SpotColorAnonymousComponent
  | SpotColorNamedComponent;

export interface ColorProfile {
  readonly name: string;
  readonly src: SrcDescriptor;
  readonly components: readonly ComponentEntry[];
  readonly renderingIntent?: string;
}

/**
 * Default ink names for device-cmyk src.
 */
const DEVICE_CMYK_INK_NAMES = ["Cyan", "Magenta", "Yellow", "Black"];

/**
 * Resolve the ink name for a process color component.
 * For device-cmyk, positions 0-3 map to Cyan/Magenta/Yellow/Black.
 * Otherwise, the ident string is used as the ink name.
 */
export function resolveInkName(
  ident: string,
  position: number,
  src: SrcDescriptor,
): string {
  if (src.kind === "device-cmyk" && position < DEVICE_CMYK_INK_NAMES.length) {
    return DEVICE_CMYK_INK_NAMES[position]!;
  }
  return ident;
}

/**
 * Generate the unit vector fallback for a process color component.
 * Position i in an N-component src space produces a vector with 1 at index i.
 */
export function unitVector(position: number, srcN: number): number[] {
  const v = new Array<number>(srcN).fill(0);
  if (position < srcN) {
    v[position] = 1;
  }
  return v;
}

/**
 * Compute the fallback color in the src space from component values.
 * Uses the linear blend formula from faceless2's proposal:
 *
 *   Xᵢ = 1 - ∏ⱼ (1 - Cⱼ × Nᵢⱼ)
 *
 * @param components - resolved component entries with fallback vectors
 * @param values - input component values (0..1)
 * @param srcN - number of components in the src space
 * @returns fallback values in the src space
 */
export function computeFallback(
  components: readonly ComponentEntry[],
  values: readonly number[],
  srcN: number,
): number[] {
  const result = new Array<number>(srcN).fill(0);

  for (let i = 0; i < srcN; i++) {
    let product = 1;
    for (let j = 0; j < components.length; j++) {
      const comp = components[j]!;
      const fallback = comp.fallback ?? unitVector(j, srcN);
      const nij = fallback[i] ?? 0;
      const cj = values[j] ?? 0;
      product *= 1 - cj * nij;
    }
    result[i] = 1 - product;
  }

  return result;
}

/**
 * Determine the number of components in a src space.
 */
export function srcComponentCount(src: SrcDescriptor): number {
  switch (src.kind) {
    case "device-cmyk":
      return 4;
    case "srgb":
      return 3;
    case "lab":
      return 3;
    case "url":
      // Must be determined from ICC profile
      return -1;
  }
}

/**
 * Map src descriptor to PDF alternate space name.
 */
export function srcToAlternateSpace(
  src: SrcDescriptor,
): "DeviceCMYK" | "DeviceRGB" | "Lab" {
  switch (src.kind) {
    case "device-cmyk":
      return "DeviceCMYK";
    case "srgb":
      return "DeviceRGB";
    case "lab":
      return "Lab";
    case "url":
      // Must be determined from ICC profile
      return "DeviceRGB";
  }
}
