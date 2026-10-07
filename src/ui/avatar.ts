/**
 * A traveler's face as a little badge: the pawn's hat, in the player's
 * colour. Drawn as inline SVG so it stays crisp in the setup screen, the
 * scoreboard and the Chautari.
 */

import type { HatStyle } from '../engine/types.ts';

export const HAT_LABEL: Record<HatStyle, string> = {
  sunhat: 'Sun hat',
  topi: 'Dhaka topi',
  cap: 'Trekking cap',
  beanie: 'Woolly hat',
};

/** Only ever a #rrggbb from our own palette, but never trust a string headed for markup. */
function safeHex(color: string, fallback = '#8e2f3f'): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number): number => Math.max(0, Math.min(255, Math.round(c * k)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

let uid = 0;

function hatMarkup(hat: HatStyle, color: string, id: string): string {
  const dark = shade(color, 0.62);
  const light = shade(color, 1.25);
  switch (hat) {
    case 'sunhat':
      return `
        <ellipse cx="32" cy="27" rx="23" ry="5.5" fill="${dark}"/>
        <path d="M21 27 C21 14 43 14 43 27 Z" fill="${color}"/>
        <rect x="21" y="22.5" width="22" height="3.2" fill="#e2b23a"/>`;
    case 'topi':
      // The Dhaka topi: a slanted, patterned cap — taller on one side.
      return `
        <defs><pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="${color}"/>
          <rect width="3" height="3" fill="${dark}"/>
          <circle cx="4.5" cy="4.5" r="0.9" fill="#fff3d0"/>
        </pattern></defs>
        <path d="M18 29 L46 29 L43 13 Q32 11 22 18 Z" fill="url(#${id})" stroke="${dark}" stroke-width="1"/>
        <rect x="18" y="26.5" width="28" height="3" fill="${dark}"/>`;
    case 'cap':
      return `
        <path d="M18 29 C18 13 46 13 46 29 Z" fill="${color}"/>
        <path d="M40 28 Q52 27 55 31 Q47 32 40 31 Z" fill="${dark}"/>
        <circle cx="32" cy="15.5" r="1.8" fill="${dark}"/>
        <path d="M32 15 L32 29" stroke="${dark}" stroke-width="0.8" opacity="0.5"/>`;
    case 'beanie':
      return `
        <path d="M18 30 C18 12 46 12 46 30 Z" fill="${color}"/>
        <rect x="17.5" y="25" width="29" height="6" rx="2" fill="${dark}"/>
        <path d="M21 25v6M25 25v6M29 25v6M33 25v6M37 25v6M41 25v6" stroke="${light}" stroke-width="1" opacity="0.55"/>
        <circle cx="32" cy="11" r="4.2" fill="#fff3d0"/>`;
  }
}

/** The badge as an SVG element, `size` px square. */
export function avatar(color: string, hat: HatStyle = 'sunhat', size = 40): SVGSVGElement {
  const c = safeHex(color);
  const id = `topi-${++uid}`;
  const markup = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="${shade(c, 1.0)}" opacity="0.18"/>
      <circle cx="32" cy="32" r="30" fill="none" stroke="${c}" stroke-width="3"/>
      <path d="M17 58 Q32 44 47 58 Z" fill="${c}"/>
      <circle cx="32" cy="37" r="13.5" fill="#e8c39e"/>
      <circle cx="26.8" cy="37.5" r="1.7" fill="#2a1f16"/>
      <circle cx="37.2" cy="37.5" r="1.7" fill="#2a1f16"/>
      <circle cx="23.5" cy="42" r="2.4" fill="#e88a7a" opacity="0.55"/>
      <circle cx="40.5" cy="42" r="2.4" fill="#e88a7a" opacity="0.55"/>
      <path d="M28.5 43.2 Q32 46.2 35.5 43.2" stroke="#2a1f16" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      ${hatMarkup(hat, c, id)}
    </svg>`;
  const holder = document.createElement('span');
  holder.innerHTML = markup.trim();
  const svg = holder.firstElementChild as SVGSVGElement;
  svg.classList.add('avatar');
  return svg;
}
