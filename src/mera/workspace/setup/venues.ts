// The shared runtime catalogue is plain JavaScript; keep its frontend boundary typed here.
// @ts-ignore Shared JavaScript module has no declaration file.
import * as catalogue from "../../../../shared/mera-venues.js";
type Preset = {
  label: string;
  bestFor: string;
  youGet: string[];
  differentBecause: string;
  capabilities: string[];
  hours: { days: number[]; start: string; end: string }[];
  cutoff: number;
  payLater: boolean;
};
export const TYPE_DEFAULTS = catalogue.TYPE_DEFAULTS as Record<string, Preset>;
export const VENUE_TYPES = catalogue.VENUE_TYPES as string[];
export const CAPABILITIES = catalogue.CAPABILITIES as string[];
export const CAPABILITY_LABELS = catalogue.CAPABILITY_LABELS as Record<
  string,
  string
>;
export const LOCATION_COLORS = catalogue.LOCATION_COLORS as string[];
export const deriveVenueType = catalogue.deriveVenueType as (
  settings?: any,
) => string;
export const effectiveCapabilities = catalogue.effectiveCapabilities as (
  settings?: any,
) => string[];
export const defaultLocationCode = catalogue.defaultLocationCode as (
  name?: string,
  taken?: string[],
) => string;
