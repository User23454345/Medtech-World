import type { SVGProps } from 'react';

/** Einheitliches Icon-Set (24×24, Strichstärke 1.8) – keine externen Abhängigkeiten. */
const PATHS: Record<string, string> = {
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13v2H6a2 2 0 0 1-2 0ZM8 7h7M8 11h5',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.2L3.6 17.2a1.8 1.8 0 1 0 2.5 2.5l5.7-5.7a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.2-.3-.3-2.2 2.6-2.2Z',
  cube: 'M12 2.8 20 7v10l-8 4.2L4 17V7l8-4.2ZM4 7l8 4.2L20 7M12 11.2v10',
  cart: 'M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2M9.5 20.5h.01M17.5 20.5h.01',
  pulse: 'M2 12h4l2.5-6 4 12 3-8 1.5 2H22',
  graduation: 'M2 9l10-5 10 5-10 5L2 9Zm4 2.2V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.8M22 9v6',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
  briefcase: 'M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8Zm5 0V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 13h18',
  device: 'M5 4h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm4 17h6M12 17v4M7 11h2l1.5-3 2 6 1.5-3H17',
  factory: 'M3 21V10l5 3V10l5 3V6l8 4v11H3Zm4-4h2m4 0h2',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Zm5-4h.01',
  chip: 'M7 7h10v10H7V7Zm3-4v4m4-4v4m-4 10v4m4-4v4M3 10h4m-4 4h4m10-4h4m-4 4h4',
  image: 'M4 5h16v14H4V5Zm0 10 4-4 4 4 3-3 5 5M15.5 9.5h.01',
  question: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6m0 3h.01',
  alert: 'M12 3 2 20h20L12 3Zm0 6v5m0 3h.01',
  clipboard: 'M9 4h6v3H9V4ZM7 5H5v16h14V5h-2M8 12l2.5 2.5L16 9',
  box: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Zm0 0 9 4.5 9-4.5M12 12v9',
  file: 'M6 3h8l5 5v13H6V3Zm8 0v5h5M9 13h7M9 17h5',
  scale: 'M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7Zm14 0-3 7a3 3 0 0 0 6 0l-3-7Z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm10 3-5-5',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8L12 3.5Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  menu: 'M3 6h18M3 12h18M3 18h18',
  x: 'M6 6l12 12M18 6 6 18',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  check: 'M4 12.5 9 17.5 20 6.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-11v6m0-9h.01',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-14v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  home: 'M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5',
  note: 'M5 3h14v12l-6 6H5V3Zm8 18v-6h6M8 8h8M8 12h5',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Zm-3 9 2 2 4-4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.3 7.3 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  play: 'M7 4v16l13-8L7 4Z',
  pause: 'M7 4h4v16H7V4Zm6 0h4v16h-4V4Z',
  reset: 'M4 4v6h6M4.5 15a8 8 0 1 0 1.9-8.3L4 9',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4',
  download: 'M12 4v11m-5-5 5 5 5-5M4 20h16',
  plus: 'M12 5v14M5 12h14',
  send: 'M4 12 20 4l-4 16-4-7-8-1Zm8 1 8-9',
  layers: 'M12 3 2 8l10 5 10-5-10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
};

export type IconName = keyof typeof PATHS | (string & {});

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** Ausgefülltes Icon (z. B. aktiver Favoritenstern) */
  filled?: boolean;
  title?: string;
}

export function Icon({ name, size = 18, filled = false, title, ...rest }: IconProps) {
  const d = PATHS[name] ?? PATHS.info!;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS);
