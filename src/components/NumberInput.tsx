import { useEffect, useRef, useState } from 'react';

interface NumberInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
  className?: string;
  ariaLabel?: string;
  id?: string;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * Numeric input that lets users type freely and clamps only when committed.
 * Avoids the "typing 120 jumps to 40" problem of directly clamped controlled inputs.
 */
export function NumberInput({
  value,
  min,
  max,
  step,
  onCommit,
  className,
  ariaLabel,
  id,
}: NumberInputProps) {
  const [text, setText] = useState(formatValue(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(formatValue(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(text);
    if (text.trim() === '' || !Number.isFinite(parsed)) {
      setText(formatValue(value));
      return;
    }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setText(formatValue(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      id={id}
      className={className}
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
    />
  );
}
