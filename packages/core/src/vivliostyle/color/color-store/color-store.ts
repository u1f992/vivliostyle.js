import { SRGBValue } from "./srgb-value";
import type { ColorEntry } from "./color-entry";

interface StoreEntry {
  entry: ColorEntry;
  locked: boolean;
}

function* getOffsets(distance: number): Generator<[number, number, number]> {
  for (let r = -distance; r <= distance; r++) {
    for (let g = -distance; g <= distance; g++) {
      for (let b = -distance; b <= distance; b++) {
        if (Math.abs(r) + Math.abs(g) + Math.abs(b) === distance) {
          yield [r, g, b];
        }
      }
    }
  }
}

export interface ColorStoreJSON {
  cmykProfile: string | null;
  colors: Record<string, ColorEntry>;
}

/**
 * A reserve map entry: sRGB key (integer triple) → ColorEntry.
 * Used to pre-populate the ColorStore with known color mappings.
 */
export type ReserveMapEntry = [{ r: number; g: number; b: number }, ColorEntry];

export function isValidReserveMap(data: unknown): data is ReserveMapEntry[] {
  if (!Array.isArray(data)) {
    return false;
  }
  return data.every((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return false;
    }
    const [rgb, colorEntry] = entry;
    if (
      !rgb ||
      typeof rgb !== "object" ||
      Array.isArray(rgb) ||
      !colorEntry ||
      typeof colorEntry !== "object" ||
      Array.isArray(colorEntry)
    ) {
      return false;
    }
    const rgbObj = rgb as Record<string, unknown>;
    return (
      Number.isFinite(rgbObj.r) &&
      Number.isFinite(rgbObj.g) &&
      Number.isFinite(rgbObj.b) &&
      typeof (colorEntry as Record<string, unknown>).type === "string"
    );
  });
}

export class ColorStore {
  #map = new Map<string, StoreEntry>();
  #cmykProfile: string | null = null;

  setCmykProfile(url: string | null): void {
    this.#cmykProfile = url;
  }

  /**
   * Register an RGB direct color. These always lock their key.
   * If the key is already held by a non-RGB color, that color is evicted.
   */
  registerRgbDirect(srgb: SRGBValue, entry: ColorEntry): void {
    const key = srgb.toKey();
    const existing = this.#map.get(key);

    if (existing !== undefined) {
      if (existing.locked) {
        // Already locked by another RGB direct — same key, no conflict
        return;
      }
      // Evict the non-RGB color to a nearby slot
      this.#evict(key, existing);
    }

    this.#map.set(key, { entry, locked: true });
  }

  /**
   * Register a non-RGB color. Returns the SRGBValue actually assigned
   * (may differ from requested if collision occurred).
   */
  registerNonRgb(srgb: SRGBValue, entry: ColorEntry): SRGBValue {
    const key = srgb.toKey();
    const existing = this.#map.get(key);

    if (existing === undefined) {
      this.#map.set(key, { entry, locked: false });
      return srgb;
    }

    // Key taken (locked or not) — find nearby slot
    return this.#findAvailableSlot(srgb, entry);
  }

  /**
   * Pre-populate the store with known color mappings.
   * Reserved entries are registered as non-RGB (they can be evicted by RGB direct colors).
   */
  registerReserveMap(entries: ReserveMapEntry[]): void {
    for (const [rgb, entry] of entries) {
      const srgb = SRGBValue.fromInt(rgb.r, rgb.g, rgb.b);
      this.#map.set(srgb.toKey(), { entry, locked: false });
    }
  }

  toJSON(): ColorStoreJSON {
    const colors: Record<string, ColorEntry> = {};
    this.#map.forEach((storeEntry, key) => {
      colors[key] = storeEntry.entry;
    });
    return {
      cmykProfile: this.#cmykProfile,
      colors,
    };
  }

  #evict(key: string, storeEntry: StoreEntry): void {
    this.#map.delete(key);
    // Parse the key back to SRGBValue for offset search
    const [r, g, b] = JSON.parse(key) as [number, number, number];
    const baseSrgb = SRGBValue.fromInt(r, g, b);
    this.#findAvailableSlot(baseSrgb, storeEntry.entry);
  }

  #findAvailableSlot(baseSrgb: SRGBValue, entry: ColorEntry): SRGBValue {
    for (let distance = 1; distance <= SRGBValue.MAX; distance++) {
      for (const [dr, dg, db] of getOffsets(distance)) {
        const candidate = baseSrgb.offset(dr, dg, db);
        const candidateKey = candidate.toKey();
        if (!this.#map.has(candidateKey)) {
          this.#map.set(candidateKey, { entry, locked: false });
          return candidate;
        }
      }
    }

    // Exhausted — should not happen in practice
    this.#map.set(baseSrgb.toKey(), { entry, locked: false });
    return baseSrgb;
  }
}
