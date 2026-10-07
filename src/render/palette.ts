/**
 * Colours, lifted from the printed board so the 3D version reads as the same
 * game: warm yellow travel tiles, maroon-on-pink Nepal Mandal, jungle green
 * Chitwan, cold blue-white for the mountains.
 */

import type { NodeKind, SectionId } from '../engine/types.ts';

export const SECTION_COLOR: Record<SectionId, number> = {
  airport: 0xe7e2d6,
  nepalmandal: 0xe05a7d,
  chitwan: 0x3f9a5c,
  lumbini: 0xf0a02c,
  pokhara: 0x3fa8c8,
  himalayan: 0x8d7fd0,
  eastern: 0x5fb85f,
  westernterai: 0xd8893f,
  westernhillside: 0xe55a92,
  mountain: 0x8fb8e8,
};

export const SECTION_LABEL: Record<SectionId, string> = {
  airport: 'Tribhuvan International Airport',
  nepalmandal: 'Nepal Mandal',
  chitwan: 'Chitwan',
  lumbini: 'Lumbini',
  pokhara: 'Pokhara',
  himalayan: 'Himalayan Village',
  eastern: 'Eastern Nepal',
  westernterai: 'Western Terai',
  westernhillside: 'Western Hillside',
  mountain: 'Mountain Expedition',
};

/** The travel tiles themselves — the yellow road from the printed board. */
export const TILE_COLOR: Record<NodeKind, number> = {
  path: 0xf2cf5e,
  start: 0xf5f0e4,
  checkpoint: 0xc2342f,
  junction: 0xf08a3c,
  'ticket-counter': 0x7e4fc4,
  terminus: 0xf5f0e4,
};

export const BOARD_BASE = 0xf7f2e4;
export const WATER = 0x8fc4d8;
export const SKY_TOP = 0x9fd0ea;
export const SKY_BOTTOM = 0xf6ead4;

/** The gated trips, as the printed board and the tickets name them. */
export const TRIP_LABEL: Partial<Record<SectionId, string>> = {
  mountain: 'Mountain Expedition',
  eastern: 'Eastern Trip',
  westernterai: 'Western Terai Trip',
  westernhillside: 'Western Hillside Trip',
};

/** Short names, for a ticket stub or a booth sign. */
export const TRIP_SHORT: Partial<Record<SectionId, string>> = {
  mountain: 'Mountain',
  eastern: 'Eastern',
  westernterai: 'W. Terai',
  westernhillside: 'W. Hillside',
};

/** What each trip is known for: snows, tea gardens, tigers, hill towns. */
export const TRIP_ICON: Partial<Record<SectionId, string>> = {
  mountain: '🏔️',
  eastern: '🍃',
  westernterai: '🐅',
  westernhillside: '🏘️',
};

/** The trip a ticket is for, by name — falling back to the section's own name. */
export function tripName(section: SectionId): string {
  return TRIP_LABEL[section] ?? SECTION_LABEL[section];
}

export function hexColor(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}
