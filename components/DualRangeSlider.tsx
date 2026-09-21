"use client";

import { useMemo } from "react";

interface DualRangeSliderProps {
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
  formatValue: (v: number) => string;
}

export default function DualRangeSlider({
  min,
  max,
  step,
  valueMin,
  valueMax,
  onChange,
  formatValue,
}: DualRangeSliderProps) {
  const pctMin = useMemo(() => ((valueMin - min) / (max - min)) * 100, [valueMin, min, max]);
  const pctMax = useMemo(() => ((valueMax - min) / (max - min)) * 100, [valueMax, min, max]);

  function handleMinChange(v: number) {
    const next = Math.min(v, valueMax - step);
    onChange(next, valueMax);
  }

  function handleMaxChange(v: number) {
    const next = Math.max(v, valueMin + step);
    onChange(valueMin, next);
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 text-sm">
        <div className="rounded-lg bg-surface-muted px-3 py-1.5">
          <span className="text-muted">Min: </span>
          <span className="font-semibold text-foreground">{formatValue(valueMin)}</span>
        </div>
        <div className="rounded-lg bg-surface-muted px-3 py-1.5">
          <span className="text-muted">Max: </span>
          <span className="font-semibold text-foreground">{formatValue(valueMax)}</span>
        </div>
      </div>

      <div className="relative h-9 flex items-center">
        <div className="absolute left-0 right-0 h-1.5 rounded-full bg-surface-muted" />
        <div
          className="absolute h-1.5 rounded-full"
          style={{ left: `${pctMin}%`, right: `${100 - pctMax}%`, background: "var(--primary)" }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMin}
          onChange={(e) => handleMinChange(Number(e.target.value))}
          className="range-thumb absolute w-full appearance-none bg-transparent pointer-events-none"
          style={{ zIndex: valueMin > max - step ? 5 : 3 }}
          aria-label="Minimum value"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMax}
          onChange={(e) => handleMaxChange(Number(e.target.value))}
          className="range-thumb absolute w-full appearance-none bg-transparent pointer-events-none"
          style={{ zIndex: 4 }}
          aria-label="Maximum value"
        />
      </div>

      <div className="flex items-center justify-between mt-1 text-[11px] text-muted">
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>

      <style jsx>{`
        .range-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          pointer-events: all;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #ffffff;
          border: 3px solid var(--primary);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
          cursor: pointer;
          margin-top: 0;
        }
        .range-thumb::-moz-range-thumb {
          pointer-events: all;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #ffffff;
          border: 3px solid var(--primary);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
          cursor: pointer;
        }
        .range-thumb::-webkit-slider-runnable-track {
          -webkit-appearance: none;
          height: 6px;
          background: transparent;
        }
        .range-thumb::-moz-range-track {
          height: 6px;
          background: transparent;
        }
      `}</style>
    </div>
  );
}
