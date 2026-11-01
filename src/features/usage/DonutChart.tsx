import type { ReactNode } from 'react';
import type { UsageSlice } from './model';
import styles from './UsagePage.module.scss';

const SIZE = 280;
const THICKNESS = 38;
const RADIUS = (SIZE - THICKNESS) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Surface-coloured gap between neighbouring slices, in px along the ring. */
const GAP = 2;

export const sliceColor = (slice: UsageSlice) =>
  slice.slot === null ? 'var(--usage-other)' : `var(--usage-c${slice.slot})`;

export type DonutChartProps = {
  slices: UsageSlice[];
  activeKey: string | null;
  onActiveChange: (key: string | null) => void;
  /** Centre of the ring: the total, or the hovered slice. */
  centre: ReactNode;
  ariaLabel: string;
};

/**
 * A ring of circles with dash arrays: one per slice, so a single slice is just
 * a full ring and the gaps between slices are exact.
 */
export function DonutChart({ slices, activeKey, onActiveChange, centre, ariaLabel }: DonutChartProps) {
  let offset = 0;
  return (
    <div className={styles.donut}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={ariaLabel}
        className={styles.donutSvg}
        onMouseLeave={() => onActiveChange(null)}
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          className={styles.donutTrack}
          strokeWidth={THICKNESS}
        />
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {slices.map((slice) => {
            const length = slice.share * CIRCUMFERENCE;
            const gap = slices.length > 1 ? GAP : 0;
            const drawn = Math.max(length - gap, 0.5);
            const start = offset;
            offset += length;
            const dimmed = activeKey !== null && activeKey !== slice.key;
            return (
              <circle
                key={slice.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={sliceColor(slice)}
                strokeWidth={activeKey === slice.key ? THICKNESS + 6 : THICKNESS}
                strokeDasharray={`${drawn} ${CIRCUMFERENCE - drawn}`}
                strokeDashoffset={-start}
                className={styles.donutSlice}
                data-dimmed={dimmed || undefined}
                onMouseEnter={() => onActiveChange(slice.key)}
              />
            );
          })}
        </g>
      </svg>
      <div className={styles.donutCentre}>{centre}</div>
    </div>
  );
}
