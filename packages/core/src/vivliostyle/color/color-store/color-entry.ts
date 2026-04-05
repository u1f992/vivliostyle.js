export interface DeviceRGBEntry {
  readonly type: "DeviceRGB";
}

export interface DeviceCMYKEntry {
  readonly type: "DeviceCMYK";
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
}

export interface LabEntry {
  readonly type: "Lab";
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export interface ICCBasedEntry {
  readonly type: "ICCBased";
  readonly src: string;
  readonly alternate?: "Lab" | "DeviceRGB" | "DeviceCMYK" | "DeviceGray";
  readonly components: readonly number[];
}

export interface DeviceNInk {
  readonly name: string;
  readonly fallback: readonly number[];
  readonly value: number;
}

export interface DeviceNEntry {
  readonly type: "DeviceN";
  readonly alternateSpace: "DeviceCMYK" | "DeviceRGB" | "Lab";
  readonly inks: readonly DeviceNInk[];
}

export type ColorEntry =
  | DeviceRGBEntry
  | DeviceCMYKEntry
  | LabEntry
  | ICCBasedEntry
  | DeviceNEntry;
