/**
 * Le chronomètre d'une manche (src/lib/timer.ts) : il ne compte que le temps
 * passé à chercher.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clock,
  formatDuration,
  formatSeconds,
  IDLE_WATCH,
  pauseWatch,
  readWatch,
  startWatch,
} from '@/lib/timer';

describe('le chronomètre', () => {
  it('démarre à zéro et compte le temps écoulé', () => {
    const watch = startWatch(IDLE_WATCH, 1000);
    assert.equal(readWatch(watch, 1000), 0);
    assert.equal(readWatch(watch, 4500), 3500);
  });

  it('ne compte plus rien pendant une pause', () => {
    const paused = pauseWatch(startWatch(IDLE_WATCH, 0), 2000);
    assert.equal(readWatch(paused, 2000), 2000);
    assert.equal(readWatch(paused, 60_000), 2000);
  });

  it('additionne les segments joués', () => {
    let watch = startWatch(IDLE_WATCH, 0);
    watch = pauseWatch(watch, 3000); // 3 s de recherche
    watch = startWatch(watch, 10_000); // 7 s à lire la correction
    assert.equal(readWatch(watch, 12_000), 5000);
  });

  it('ignore un second départ ou une seconde pause', () => {
    const running = startWatch(IDLE_WATCH, 100);
    assert.equal(startWatch(running, 900), running);
    const paused = pauseWatch(running, 500);
    assert.equal(pauseWatch(paused, 900), paused);
  });

  it('ne recule jamais, même si l’horloge recule', () => {
    const watch = startWatch({ elapsed: 4000, since: null }, 10_000);
    assert.equal(readWatch(watch, 9000), 4000);
  });

  it('lit une horloge qui ne revient pas en arrière', () => {
    const first = clock();
    assert.ok(clock() >= first);
  });
});

describe('l’affichage des durées', () => {
  it('écrit les minutes et les secondes', () => {
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(7000), '0:07');
    assert.equal(formatDuration(102_000), '1:42');
    assert.equal(formatDuration(723_000), '12:03');
    assert.equal(formatDuration(3_725_000), '62:05');
  });

  it('arrondit à la seconde et ne descend pas sous zéro', () => {
    assert.equal(formatDuration(1499), '0:01');
    assert.equal(formatDuration(-5000), '0:00');
  });

  it('écrit une durée courte au dixième, avec une virgule', () => {
    assert.equal(formatSeconds(4200), '4,2 s');
    assert.equal(formatSeconds(0), '0,0 s');
    assert.equal(formatSeconds(-300), '0,0 s');
  });
});
