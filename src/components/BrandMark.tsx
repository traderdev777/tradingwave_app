type Props = { className?: string; animated?: boolean };

/** The TradingWave wave mark. `animated` lets the landing draw-on animation run on it. */
export function BrandMark({ className = "brand__mark", animated = true }: Props) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <path
        className={animated ? "mark-stroke" : "mark-stroke static"}
        d="M12 50 C23 50 26 94 39 94 C52 94 51 58 59 58 C67 58 66 94 79 94 C92 94 94 46 101 34"
      />
      <circle className="mark-dot" cx="109" cy="19" r="8" />
    </svg>
  );
}
