/** Иконки инлайновым SVG: иконочные шрифты не тянем (5.9). */

import type { JSX } from 'react';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const IconHome = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.6V20h14V9.6" />
    <path d="M9.5 20v-5.5h5V20" />
  </svg>
);

export const IconCoin = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.2v9.6" />
    <path d="M14.4 9.6c0-1.1-1.1-1.8-2.4-1.8s-2.4.7-2.4 1.8 1.1 1.5 2.4 1.8 2.4.7 2.4 1.8-1.1 1.8-2.4 1.8-2.4-.7-2.4-1.8" />
  </svg>
);

export const IconTarget = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

export const IconDash = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="3" width="8" height="9" rx="2" />
    <rect x="13" y="3" width="8" height="5" rx="2" />
    <rect x="13" y="10" width="8" height="11" rx="2" />
    <rect x="3" y="14" width="8" height="7" rx="2" />
  </svg>
);

export const IconSettings = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.4 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.4-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" />
  </svg>
);

export const IconBack = (): JSX.Element => (
  <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} strokeWidth={2.2}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const IconChevron = (): JSX.Element => (
  <svg width="7" height="12" viewBox="0 0 8 14" {...stroke}>
    <path d="M1 1l6 6-6 6" />
  </svg>
);

export const IconPlus = (): JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} strokeWidth={2.4}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconSun = (): JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
  </svg>
);

export const IconMoon = (): JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
);

export const Burger = (): JSX.Element => (
  <span className="burger">
    <span />
    <span />
    <span />
  </span>
);
