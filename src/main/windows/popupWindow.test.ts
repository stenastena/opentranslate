import { describe, expect, it } from 'vitest';
import { clampToWorkArea, resolveCursorAnchor } from './popupWindow';

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };

describe('clampToWorkArea', () => {
  it('leaves a position that already fits unchanged', () => {
    expect(clampToWorkArea(500, 400, 480, 360, WORK_AREA)).toEqual({ x: 500, y: 400 });
  });

  it('clamps a position that would spill past the right/bottom edge', () => {
    expect(clampToWorkArea(1900, 1070, 480, 360, WORK_AREA)).toEqual({ x: 1440, y: 720 });
  });

  it('clamps a negative position back onto the work area', () => {
    expect(clampToWorkArea(-50, -50, 480, 360, WORK_AREA)).toEqual({ x: 0, y: 0 });
  });

  it('respects a non-zero work-area origin (a secondary monitor to the left/above the primary)', () => {
    const secondary = { x: -1920, y: 0, width: 1920, height: 1080 };
    expect(clampToWorkArea(-2000, 500, 480, 360, secondary)).toEqual({ x: -1920, y: 500 });
  });
});

describe('resolveCursorAnchor', () => {
  it('offsets down-right of the cursor when there is room', () => {
    expect(resolveCursorAnchor(500, 400, 480, 360, WORK_AREA)).toEqual({ x: 512, y: 412 });
  });

  it('flips to the left of the cursor instead of clamping when the default offset would spill past the right edge', () => {
    // Issue #18: near the right edge, plain clamping would slide the popup
    // back so its right edge touches the screen edge — which puts it
    // directly over the cursor/selection again. Flipping to the cursor's
    // left avoids that.
    const result = resolveCursorAnchor(1800, 400, 480, 360, WORK_AREA);
    expect(result.x).toBe(1800 - 480 - 12);
    expect(result.x + 480).toBeLessThanOrEqual(WORK_AREA.width);
  });

  it('flips above the cursor instead of clamping when the default offset would spill past the bottom edge', () => {
    const result = resolveCursorAnchor(500, 1000, 480, 360, WORK_AREA);
    expect(result.y).toBe(1000 - 360 - 12);
    expect(result.y + 360).toBeLessThanOrEqual(WORK_AREA.height);
  });

  it('flips both axes at once when the cursor is in the bottom-right corner', () => {
    const result = resolveCursorAnchor(1800, 1000, 480, 360, WORK_AREA);
    expect(result.x).toBe(1800 - 480 - 12);
    expect(result.y).toBe(1000 - 360 - 12);
  });

  it('still clamps as a last resort when even the flipped position does not fit (a popup bigger than the screen)', () => {
    // Same pre-existing clampToWorkArea behavior as before #18: when the
    // popup itself is bigger than the work area, its upper clamp bound
    // (workArea.x + workArea.width - width) goes negative, so the result
    // necessarily extends past the left/top edge — there's no position
    // that fits a too-big window inside a too-small screen.
    const tinyScreen = { x: 0, y: 0, width: 300, height: 200 };
    const result = resolveCursorAnchor(150, 100, 480, 360, tinyScreen);
    expect(result).toEqual({ x: -180, y: -160 });
  });

  it('stays within the work area of a secondary monitor', () => {
    const secondary = { x: -1920, y: 0, width: 1920, height: 1080 };
    const result = resolveCursorAnchor(-100, 400, 480, 360, secondary);
    expect(result.x + 480).toBeLessThanOrEqual(secondary.x + secondary.width);
    expect(result.x).toBeGreaterThanOrEqual(secondary.x);
  });
});
