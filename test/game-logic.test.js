// Tier 1 — pure game-logic tests.
//
// These exercise the scoring "rules engine": base-running advancement, run/RBI
// crediting, runner lookup, sub-aware stat selection, and game-end detection.
// Each test gets a fresh app instance (own window + own G) via loadApp().

import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './helpers/loadApp.js';

let w; // the loaded app window — functions and G live here

beforeEach(() => {
  w = loadApp();
});

describe('advanceRunners', () => {
  it('moves runners forward by N bases without overwriting', () => {
    // Runners on 1B and 3B, advance everyone 1 base.
    w.G.bases = ['R1', null, 'R3'];
    const runs = w.advanceRunners('away', 1);
    // R3 scores; R1 -> 2B.
    expect(runs).toBe(1);
    expect(w.G.bases).toEqual([null, 'R1', null]);
  });

  it('processes 3B -> 1B so a trailing runner never clobbers a lead runner', () => {
    // Bases loaded, advance 1: the 3B->2B->1B order matters or names get lost.
    w.G.bases = ['R1', 'R2', 'R3'];
    const runs = w.advanceRunners('away', 1);
    expect(runs).toBe(1); // R3 scores
    expect(w.G.bases).toEqual([null, 'R1', 'R2']);
  });

  it('scores every runner on a multi-base advance (e.g. HR with two on)', () => {
    w.G.bases = ['R1', null, 'R3'];
    const runs = w.advanceRunners('away', 4); // grand-slam-style clearing
    expect(runs).toBe(2);
    expect(w.G.bases).toEqual([null, null, null]);
  });

  it('updates the running total and the current inning line score', () => {
    w.G.inning = 3;
    w.G.bases = [null, null, 'R3'];
    w.advanceRunners('away', 1);
    expect(w.G.rhe.away[0]).toBe(1);
    expect(w.G.scores.away[2]).toBe(1); // inning 3 -> index 2
  });
});

describe('forceAdvance (walks / HBP / IBB)', () => {
  it('puts the batter on 1B with the bases empty and forces no one', () => {
    w.G.bases = [null, null, null];
    const runs = w.forceAdvance('away', 'Batter');
    expect(runs).toBe(0);
    expect(w.G.bases).toEqual(['Batter', null, null]);
  });

  it('forces in a run only when the bases are loaded', () => {
    w.G.inning = 1;
    w.G.bases = ['R1', 'R2', 'R3'];
    const runs = w.forceAdvance('away', 'Batter');
    expect(runs).toBe(1); // R3 forced home
    expect(w.G.bases).toEqual(['Batter', 'R1', 'R2']);
    expect(w.G.rhe.away[0]).toBe(1);
  });

  it('does NOT advance a non-forced runner (runner on 2B only)', () => {
    // Classic rule: with 1B open, the runner on 2B is not forced on a walk.
    w.G.bases = [null, 'R2', null];
    const runs = w.forceAdvance('away', 'Batter');
    expect(runs).toBe(0);
    expect(w.G.bases).toEqual(['Batter', 'R2', null]);
  });

  it('advances the chain up to the first open base (runner on 1B only)', () => {
    w.G.bases = ['R1', null, null];
    const runs = w.forceAdvance('away', 'Batter');
    expect(runs).toBe(0);
    expect(w.G.bases).toEqual(['Batter', 'R1', null]);
  });
});

describe('findRunnerSlot', () => {
  beforeEach(() => {
    w.G.lineup.away[0].name = 'Alice';
    w.G.lineup.away[3].name = 'Bob';
  });

  it('finds a runner by current lineup name', () => {
    expect(w.findRunnerSlot('away', 'Alice')).toBe(0);
    expect(w.findRunnerSlot('away', 'Bob')).toBe(3);
  });

  it('returns -1 for unknown / sentinel runner values', () => {
    expect(w.findRunnerSlot('away', 'Nobody')).toBe(-1);
    expect(w.findRunnerSlot('away', '?')).toBe(-1);
    expect(w.findRunnerSlot('away', null)).toBe(-1);
    expect(w.findRunnerSlot('away', true)).toBe(-1);
  });
});

describe('creditRun / creditRBI', () => {
  it('credits the run to the slot of the runner who scored', () => {
    w.G.lineup.away[2].name = 'Scorer';
    w.creditRun('away', 'Scorer');
    expect(w.activeHits('away', 2).r).toBe(1);
  });

  it('does not throw and credits nothing for an unknown runner', () => {
    const before = w.G.lineup.away.map((s) => s.hits.r);
    expect(() => w.creditRun('away', 'Ghost')).not.toThrow();
    expect(w.G.lineup.away.map((s) => s.hits.r)).toEqual(before);
  });

  it('credits RBI(s) to the current batter', () => {
    w.G.awayBatter = 4;
    w.creditRBI('away', 2);
    expect(w.activeHits('away', 4).rbi).toBe(2);
  });

  it('ignores zero / negative RBI counts', () => {
    w.G.awayBatter = 1;
    w.creditRBI('away', 0);
    w.creditRBI('away', -3);
    expect(w.activeHits('away', 1).rbi).toBe(0);
  });
});

describe('activeHits (substitution-aware)', () => {
  it('returns the starter hits object when there are no subs', () => {
    expect(w.activeHits('home', 0)).toBe(w.G.lineup.home[0].hits);
  });

  it('returns the latest sub hits object once a sub exists', () => {
    const sub = w.mkSlot();
    sub.name = 'Pinch';
    w.G.lineup.home[0].subs.push(sub);
    expect(w.activeHits('home', 0)).toBe(sub.hits);
  });
});

describe('isGameOver', () => {
  const setState = (over) => Object.assign(w.G, over);

  it('is not over before the 9th inning', () => {
    setState({ inning: 8, half: 'bot', outs: 3 });
    w.G.rhe.home[0] = 5;
    w.G.rhe.away[0] = 3;
    expect(w.isGameOver()).toBe(false);
  });

  it('ends after the bottom of the 9th when not tied', () => {
    setState({ inning: 9, half: 'bot', outs: 3 });
    w.G.rhe.home[0] = 5;
    w.G.rhe.away[0] = 3;
    expect(w.isGameOver()).toBe(true);
  });

  it('continues into extras when tied after the bottom of the 9th', () => {
    setState({ inning: 9, half: 'bot', outs: 3 });
    w.G.rhe.home[0] = 3;
    w.G.rhe.away[0] = 3;
    expect(w.isGameOver()).toBe(false);
  });

  it('ends after the top of the 9th if the home team already leads', () => {
    setState({ inning: 9, half: 'top', outs: 3 });
    w.G.rhe.home[0] = 5;
    w.G.rhe.away[0] = 3;
    expect(w.isGameOver()).toBe(true);
  });

  it('requires the bottom of the 9th if the home team trails after the top', () => {
    setState({ inning: 9, half: 'top', outs: 3 });
    w.G.rhe.home[0] = 3;
    w.G.rhe.away[0] = 5;
    expect(w.isGameOver()).toBe(false);
  });

  it('is not over mid-inning (fewer than 3 outs)', () => {
    setState({ inning: 9, half: 'bot', outs: 2 });
    w.G.rhe.home[0] = 5;
    w.G.rhe.away[0] = 3;
    expect(w.isGameOver()).toBe(false);
  });
});

describe('checkWalkoff', () => {
  it('flags a walk-off when the home team takes the lead in the bottom 9th+', () => {
    Object.assign(w.G, { inning: 9, half: 'bot' });
    w.G.rhe.home[0] = 4;
    w.G.rhe.away[0] = 3;
    expect(w.checkWalkoff()).toBe(true);
  });

  it('is not a walk-off when the game is still tied', () => {
    Object.assign(w.G, { inning: 9, half: 'bot' });
    w.G.rhe.home[0] = 3;
    w.G.rhe.away[0] = 3;
    expect(w.checkWalkoff()).toBe(false);
  });

  it('never fires in the top half of an inning', () => {
    Object.assign(w.G, { inning: 9, half: 'top' });
    w.G.rhe.home[0] = 4;
    w.G.rhe.away[0] = 3;
    expect(w.checkWalkoff()).toBe(false);
  });

  it('never fires before the 9th inning', () => {
    Object.assign(w.G, { inning: 7, half: 'bot' });
    w.G.rhe.home[0] = 4;
    w.G.rhe.away[0] = 3;
    expect(w.checkWalkoff()).toBe(false);
  });
});

describe('recalc', () => {
  it('sums the inning line scores into the R total for each side', () => {
    w.G.scores.home = [1, 0, 2, null, 0, null, null, null, 1];
    w.G.scores.away = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    w.recalc();
    expect(w.G.rhe.home[0]).toBe(4);
    expect(w.G.rhe.away[0]).toBe(0);
  });
});
