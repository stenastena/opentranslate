import { describe, expect, it } from 'vitest';
import { clampOpacity, MAX_OPACITY, MIN_OPACITY } from './schema';

describe('clampOpacity', () => {
  it('passes an in-range value through unchanged', () => {
    expect(clampOpacity(0.7)).toBe(0.7);
  });

  it('clamps a value below the minimum', () => {
    expect(clampOpacity(0)).toBe(MIN_OPACITY);
    expect(clampOpacity(-1)).toBe(MIN_OPACITY);
  });

  it('clamps a value above the maximum', () => {
    expect(clampOpacity(1.5)).toBe(MAX_OPACITY);
  });

  it('falls back to fully opaque for a non-finite value — e.g. a hand-edited settings.json', () => {
    expect(clampOpacity(NaN)).toBe(MAX_OPACITY);
    expect(clampOpacity(Infinity)).toBe(MAX_OPACITY);
  });
});
