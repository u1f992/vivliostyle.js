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
