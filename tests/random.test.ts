/**
 * Le hasard reproductible (src/lib/random.ts) : c'est lui qui donne le même
 * quiz à tous les joueurs d'une salle.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { newSeed, seeded } from '@/lib/random';

const draw = (seed: number, n: number) => {
  const random = seeded(seed);
  return Array.from({ length: n }, () => random());
};

describe('seeded : une suite de nombres tirée d’une graine', () => {
  it('donne la même suite pour la même graine, sur chaque appareil', () => {
    assert.deepEqual(draw(42, 100), draw(42, 100));
  });

  it('donne une autre suite pour une autre graine', () => {
    assert.notDeepEqual(draw(42, 10), draw(43, 10));
  });

  it('reste toujours entre 0 (compris) et 1 (exclu)', () => {
    for (const value of draw(2024, 10_000)) {
      assert.ok(value >= 0 && value < 1, `${value} hors de [0, 1)`);
    }
  });

  it('répartit les nombres à peu près également', () => {
    const buckets = new Array(10).fill(0);
    for (const value of draw(99, 20_000)) buckets[Math.floor(value * 10)] += 1;
    for (const count of buckets) assert.ok(count > 1700 && count < 2300, `${buckets}`);
  });

  it('ramène une graine sur 32 bits', () => {
    assert.deepEqual(draw(-1, 5), draw(2 ** 32 - 1, 5));
  });
});

describe('newSeed : la graine tirée par l’hôte', () => {
  it('est un entier sur 32 bits', () => {
    for (let i = 0; i < 100; i++) {
      const seed = newSeed();
      assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32, `${seed}`);
    }
  });
});
