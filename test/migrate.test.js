// Tier 2 — schema migration tests.
//
// migrateGame() is documented in index.html as "the SINGLE source of truth for
// backward compatibility". Every saved/imported game flows through it, so a
// regression here silently corrupts (or fails to load) real user data. These
// tests feed it old-shape fixtures and assert it backfills the current shape.

import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

let w;

beforeEach(() => {
  w = loadApp();
});

describe('migrateGame — defensive guards', () => {
  it('returns falsy input untouched', () => {
    expect(w.migrateGame(null)).toBe(null);
    expect(w.migrateGame(undefined)).toBe(undefined);
  });

  it('mutates and returns the same object', () => {
    const g = {};
    expect(w.migrateGame(g)).toBe(g);
  });
});

describe('migrateGame — v1 -> v2 (batterLog)', () => {
  it('adds a batterLog with both sides when missing', () => {
    const g = w.migrateGame({});
    expect(g.batterLog).toEqual({ home: {}, away: {} });
  });

  it('fills in a missing side without dropping existing data', () => {
    const g = w.migrateGame({ batterLog: { home: { 0: 'X' } } });
    expect(g.batterLog.home).toEqual({ 0: 'X' });
    expect(g.batterLog.away).toEqual({});
  });
});

describe('migrateGame — v2 -> v3 (notes) and v3 -> v4 (abs)', () => {
  it('adds a notes object with the expected default keys', () => {
    const g = w.migrateGame({});
    expect(g.notes).toBeTypeOf('object');
    expect(g.notes).toMatchObject({ date: '', venue: '', weather: '' });
  });

  it('adds ABS challenge tracking for both sides', () => {
    const g = w.migrateGame({});
    expect(g.abs).toEqual({
      home: { challenged: 0, overturned: 0 },
      away: { challenged: 0, overturned: 0 },
    });
  });

  it('repairs a partially-present abs object', () => {
    const g = w.migrateGame({ abs: { home: { challenged: 2, overturned: 1 } } });
    expect(g.abs.home).toEqual({ challenged: 2, overturned: 1 });
    expect(g.abs.away).toEqual({ challenged: 0, overturned: 0 });
  });
});

describe('migrateGame — bases normalization (very early saves)', () => {
  it('converts legacy boolean bases to name/null form', () => {
    const g = w.migrateGame({ bases: [true, false, true] });
    expect(g.bases).toEqual(['?', null, '?']);
  });

  it('leaves modern name/null bases alone', () => {
    const g = w.migrateGame({ bases: ['Alice', null, 'Bob'] });
    expect(g.bases).toEqual(['Alice', null, 'Bob']);
  });
});

describe('migrateGame — hit-key backfill on lineup slots and subs', () => {
  it('gives a slot with no hits object a full default hits object', () => {
    const g = w.migrateGame({
      lineup: { home: [{ name: 'NoHits', subs: [] }], away: [] },
    });
    const expected = w.mkHits();
    expect(g.lineup.home[0].hits).toEqual(expected);
  });

  it('backfills newly-added hit keys onto an old (partial) hits object', () => {
    // Simulate a save made before `ibb` and `wp` existed.
    const partial = { s: 2, d: 1 }; // missing every other key
    const g = w.migrateGame({
      lineup: { home: [{ name: 'Old', hits: partial, subs: [] }], away: [] },
    });
    const hits = g.lineup.home[0].hits;
    expect(hits.s).toBe(2); // existing values preserved
    expect(hits.d).toBe(1);
    expect(hits.ibb).toBe(0); // new keys backfilled to 0
    expect(hits.wp).toBe(0);
    // Every key from the current schema is present.
    Object.keys(w.mkHits()).forEach((k) => {
      expect(hits[k]).toBeTypeOf('number');
    });
  });

  it('backfills hits on subs from pre-per-sub-stats saves', () => {
    const g = w.migrateGame({
      lineup: {
        home: [{ name: 'Starter', hits: w.mkHits(), subs: [{ name: 'Sub' }] }],
        away: [],
      },
    });
    expect(g.lineup.home[0].subs[0].hits).toEqual(w.mkHits());
  });
});

describe('migrateGame — a current-shape game is a no-op', () => {
  it('passes a freshly-created game through unchanged in structure', () => {
    const fresh = w.mkGame();
    const migrated = w.migrateGame(fresh);
    expect(migrated).toBe(fresh);
    expect(Object.keys(migrated.lineup.home[0].hits).sort()).toEqual(
      Object.keys(w.mkHits()).sort()
    );
  });
});
