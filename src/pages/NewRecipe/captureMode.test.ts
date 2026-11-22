import { describe, expect, it } from 'vitest';
import { initialCaptureMode } from './captureMode';

const online = { forceManual: false, isOnline: true };

describe('initialCaptureMode', () => {
  it('opens Photo when no mode is given, as before', () => {
    expect(initialCaptureMode({ ...online, modeParam: null })).toBe('upload');
  });

  it.each(['url', 'upload', 'manual'] as const)('honours ?mode=%s online', (mode) => {
    expect(initialCaptureMode({ ...online, modeParam: mode })).toBe(mode);
  });

  it.each(['', 'camera', 'URL', 'manual ', '<script>'])('ignores unknown mode %j', (mode) => {
    expect(initialCaptureMode({ ...online, modeParam: mode })).toBe('upload');
  });

  it.each(['url', 'upload'])('falls back to Manual for ?mode=%s offline', (mode) => {
    expect(initialCaptureMode({ modeParam: mode, forceManual: false, isOnline: false })).toBe('manual');
  });

  it('keeps Manual offline', () => {
    expect(initialCaptureMode({ modeParam: 'manual', forceManual: false, isOnline: false })).toBe('manual');
  });

  it('always opens Manual for edits and planner prefills, whatever the mode', () => {
    expect(initialCaptureMode({ modeParam: 'url', forceManual: true, isOnline: true })).toBe('manual');
    expect(initialCaptureMode({ modeParam: null, forceManual: true, isOnline: true })).toBe('manual');
  });
});
