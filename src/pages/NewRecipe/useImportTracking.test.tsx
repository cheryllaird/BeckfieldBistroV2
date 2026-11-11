import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useImportTracking } from './useImportTracking';

const track = vi.fn();
vi.mock('../../lib/usage', () => ({ track: (e: unknown) => track(e) }));

const sent = () => track.mock.calls.map(([e]) => `${e.event}:${e.value}`);

beforeEach(() => track.mockReset());

describe('useImportTracking', () => {
  it('counts a started import once, then saved', () => {
    const { result, unmount } = renderHook(() => useImportTracking(true, false));

    result.current.begin('url');
    result.current.begin('url'); // extracting again is the same import
    result.current.saved('url');
    unmount();

    expect(sent()).toEqual(['import_started:url', 'import_saved:url']);
  });

  it('counts leaving the page mid-import as abandoned', () => {
    const { result, unmount } = renderHook(() => useImportTracking(true, false));

    result.current.begin('photo');
    unmount();

    expect(sent()).toEqual(['import_started:photo', 'import_abandoned:photo']);
  });

  it('counts nothing for a visit that never starts an import', () => {
    const { unmount } = renderHook(() => useImportTracking(true, false));
    unmount();
    expect(track).not.toHaveBeenCalled();
  });

  it('abandons the current import when another method starts', () => {
    const { result } = renderHook(() => useImportTracking(true, false));

    result.current.begin('url');
    result.current.begin('manual');
    result.current.saved('manual');

    expect(sent()).toEqual(['import_started:url', 'import_abandoned:url', 'import_started:manual', 'import_saved:manual']);
  });

  it('keeps started = saved + abandoned when saved as another method', () => {
    const { result } = renderHook(() => useImportTracking(true, false));

    result.current.begin('photo');
    result.current.saved('url');

    expect(sent()).toEqual(['import_started:photo', 'import_abandoned:photo', 'import_started:url', 'import_saved:url']);
  });

  it('starts a manual import on mount when the form opens straight away', () => {
    const { unmount } = renderHook(() => useImportTracking(true, true));
    unmount();
    expect(sent()).toEqual(['import_started:manual', 'import_abandoned:manual']);
  });

  it('counts nothing when editing', () => {
    const { result, unmount } = renderHook(() => useImportTracking(false, false));
    result.current.begin('url');
    result.current.saved('url');
    unmount();
    expect(track).not.toHaveBeenCalled();
  });
});
