/** Stroke-based 24px icon set. One visual voice for the whole app — no emoji. */

export type IconName =
  | 'chevron-down'
  | 'check'
  | 'plus'
  | 'x'
  | 'film'
  | 'music'
  | 'sparkles'
  | 'trash'
  | 'duplicate'
  | 'pencil'
  | 'export'
  | 'import'
  | 'warning'
  | 'link'
  | 'scissors'
  | 'home'
  | 'grid'
  | 'fit'
  | 'cursor'
  | 'wall'
  | 'box'
  | 'circle'
  | 'speaker'
  | 'star'
  | 'image'
  | 'rectangle'
  | 'undo'
  | 'ear'
  | 'layers';

/** Each icon is one or more path `d` strings drawn with round 1.7px strokes. */
const PATHS: Record<IconName, string[]> = {
  'chevron-down': ['M6 9 l6 6 l6 -6'],
  check: ['M5 12.5 l4.5 4.5 L19 7'],
  plus: ['M12 5 v14 M5 12 h14'],
  x: ['M6 6 l12 12 M18 6 L6 18'],
  film: ['M4 5.5 h16 v13 h-16 Z', 'M8 5.5 v13 M16 5.5 v13 M4 9.5 h4 M4 14.5 h4 M16 9.5 h4 M16 14.5 h4'],
  music: ['M9 18.5 V6 l10 -2 v12.5', 'M9 18.5 a2.2 2.2 0 1 1 -4.4 0 a2.2 2.2 0 1 1 4.4 0 Z', 'M19 16.5 a2.2 2.2 0 1 1 -4.4 0 a2.2 2.2 0 1 1 4.4 0 Z'],
  sparkles: ['M12 4 l1.7 4.8 L18.5 10.5 l-4.8 1.7 L12 17 l-1.7 -4.8 L5.5 10.5 l4.8 -1.7 Z', 'M18.5 15.5 l0.9 2.3 2.3 0.9 -2.3 0.9 -0.9 2.3 -0.9 -2.3 -2.3 -0.9 2.3 -0.9 Z'],
  trash: ['M5 7 h14', 'M9 7 V5 h6 v2', 'M7 7 l1 13 h8 l1 -13', 'M10.2 11 v5.5 M13.8 11 v5.5'],
  duplicate: ['M9 9 h11 v11 h-11 Z', 'M15 9 V4 H4 v11 h5'],
  pencil: ['M4 20 l1 -4 L16.5 4.5 a1.9 1.9 0 0 1 3 3 L8 19 l-4 1 Z', 'M14.5 6.5 l3 3'],
  export: ['M12 15 V4', 'M8 8 l4 -4 4 4', 'M5 15 v4 h14 v-4'],
  import: ['M12 4 v11', 'M8 11 l4 4 4 -4', 'M5 15 v4 h14 v-4'],
  warning: ['M12 4 L21.5 20 h-19 Z', 'M12 10 v4.5', 'M12 17.4 v0.01'],
  link: ['M10 14 a4 4 0 0 1 0 -5.6 l3 -3 a4 4 0 0 1 5.6 5.6 l-1.6 1.6', 'M14 10 a4 4 0 0 1 0 5.6 l-3 3 a4 4 0 0 1 -5.6 -5.6 l1.6 -1.6'],
  scissors: ['M6.5 6.5 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0', 'M6.5 17.5 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0', 'M8.2 7.9 L20 18 M8.2 16.1 L20 6'],
  home: ['M4 11.5 L12 4.5 l8 7', 'M6 10 v9.5 h12 V10'],
  grid: ['M4 4 h16 v16 h-16 Z', 'M9.3 4 v16 M14.6 4 v16 M4 9.3 h16 M4 14.6 h16'],
  fit: ['M4 9 V4 h5 M15 4 h5 v5 M20 15 v5 h-5 M9 20 H4 v-5'],
  cursor: ['M6 3 L18 12 L12 13.5 L15 20 L12.5 21 L9.5 14.5 L6 18 Z'],
  wall: ['M4 20 L20 4', 'M4 20 l0 -3 M20 4 l-3 0'],
  box: ['M5 7 h14 v10 h-14 Z'],
  circle: ['M12 5 a7 7 0 1 0 0.001 0 Z'],
  speaker: ['M12 4 a8 8 0 0 1 8 8', 'M12 8 a4 4 0 0 1 4 4', 'M12 12 m-1.6 0 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0'],
  star: ['M12 4 l2.2 5 5.3 0.5 -4 3.6 1.2 5.2 L12 15.6 7.3 18.3 l1.2 -5.2 -4 -3.6 5.3 -0.5 Z'],
  image: ['M4 5 h16 v14 h-16 Z', 'M8.5 10.5 a1.5 1.5 0 1 0 0.001 0 Z', 'M4 16 l5 -4.5 4 3.5 3 -2.5 4 3.5'],
  rectangle: ['M4 7 h16 v10 h-16 Z'],
  undo: ['M8 5 L4 9 l4 4', 'M4 9 h10 a5 5 0 0 1 0 10 h-4'],
  ear: ['M8 18 a3.5 3.5 0 0 0 6 -1 c0.6 -1.6 2.8 -2.4 2.8 -5.5 A5.4 5.4 0 0 0 6 11', 'M9.4 11.2 a2.8 2.8 0 0 1 5.3 1'],
  layers: ['M12 4 l8 4.5 -8 4.5 -8 -4.5 Z', 'M4.6 13 L12 17 l7.4 -4'],
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export default function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      style={{
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        flexShrink: 0,
      }}
    >
      {PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
