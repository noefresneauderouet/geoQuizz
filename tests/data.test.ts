/**
 * Les données du jeu : src/data/countries.json et src/data/regions.json,
 * produits par scripts/generate-countries.mjs et generate-regions.mjs.
 *
 * Une erreur ici ne se voit qu'en jouant la bonne question : un pays sans
 * capitale, une région absente de la carte, ou deux pays qui acceptent la
 * même réponse.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATEGORIES, REGION_SETS } from '@/constants/categories';
import shapes from '@/data/region-shapes.json';
import { COUNTRIES, countriesOf } from '@/lib/countries';
import { normalize } from '@/lib/normalize';
import { checkAnswer } from '@/lib/quiz';
import { regionSet } from '@/lib/regions';

const CONTINENTS = CATEGORIES.map((c) => c.id).filter((id) => id !== 'monde');

/** Les réponses qui désignent plusieurs entrées, normalisées, avec leurs codes. */
function sharedAnswers(entries: { code: string; answers: string[] }[]): Map<string, string[]> {
  const owners = new Map<string, Set<string>>();
  for (const { code, answers } of entries) {
    for (const answer of answers) {
      const key = normalize(answer);
      owners.set(key, new Set(owners.get(key)).add(code));
    }
  }
  return new Map([...owners].filter(([, codes]) => codes.size > 1).map(([key, codes]) => [key, [...codes].sort()]));
}

describe('les pays', () => {
  it('sont 196, chacun avec un code ISO unique', () => {
    assert.equal(COUNTRIES.length, 196);
    assert.equal(new Set(COUNTRIES.map((c) => c.code)).size, COUNTRIES.length);
    assert.equal(new Set(COUNTRIES.map((c) => c.numeric)).size, COUNTRIES.length);
    for (const c of COUNTRIES) {
      assert.match(c.code, /^[A-Z]{2}$/, `code ${c.code}`);
      // Le Kosovo n'a pas de code numérique ISO : il garde l'identifiant du
      // fond de carte (scripts/generate-countries.mjs).
      if (c.code !== 'XK') assert.match(c.numeric, /^\d{3}$/, `code numérique de ${c.code}`);
    }
  });

  it('ont tous un nom, une capitale, un continent et une position', () => {
    for (const c of COUNTRIES) {
      assert.ok(c.name.trim(), `${c.code} sans nom`);
      assert.ok(c.capital.trim(), `${c.code} sans capitale`);
      assert.ok(CONTINENTS.includes(c.continent), `${c.code} : continent ${c.continent}`);
      const [lat, lng] = c.latlng;
      assert.ok(Math.abs(lat) <= 90 && Math.abs(lng) <= 180, `${c.code} : position ${c.latlng}`);
    }
  });

  it('se répartissent tous entre les continents', () => {
    const total = CONTINENTS.reduce((sum, id) => sum + countriesOf(id).length, 0);
    assert.equal(total, COUNTRIES.length);
    for (const id of CONTINENTS) assert.ok(countriesOf(id).length > 0, `${id} est vide`);
  });

  it('acceptent leur propre nom et chacun de leurs alias', () => {
    for (const country of COUNTRIES) {
      for (const answer of [country.name, ...country.nameAliases]) {
        assert.ok(checkAnswer({ mode: 'pays', country }, answer).exact, `${country.code} refuse « ${answer} »`);
      }
      for (const answer of [country.capital, ...country.capitalAliases]) {
        assert.ok(checkAnswer({ mode: 'capitale', country }, answer).exact, `${country.code} refuse « ${answer} »`);
      }
    }
  });

  it('n’ont jamais un nom en commun', () => {
    const shared = sharedAnswers(COUNTRIES.map((c) => ({ code: c.code, answers: [c.name, ...c.nameAliases] })));
    assert.deepEqual(Object.fromEntries(shared), {});
  });

  it('n’ont jamais une capitale en commun, sauf La Paz', () => {
    // La Paz est le siège du gouvernement bolivien, et Ciudad de la Paz la
    // nouvelle capitale de la Guinée équatoriale : les deux l'acceptent.
    const shared = sharedAnswers(
      COUNTRIES.map((c) => ({ code: c.code, answers: [c.capital, ...c.capitalAliases] })),
    );
    assert.deepEqual(Object.fromEntries(shared), { paz: ['BO', 'GQ'] });
  });
});

describe('les régions du mode États', () => {
  for (const { id } of REGION_SETS) {
    describe(id, () => {
      const set = regionSet(id);

      it('ont chacune un code unique, préfixé par celui du pays', () => {
        assert.ok(set.regions.length > 0);
        assert.equal(new Set(set.regions.map((r) => r.code)).size, set.regions.length);
        for (const r of set.regions) assert.ok(r.code.startsWith(`${set.country.code}-`), r.code);
      });

      it('ont chacune un contour sur la carte', () => {
        const topology = (shapes as Record<string, { objects: { regions: { geometries: { id: string }[] } } }>)[id];
        assert.ok(topology, `aucun contour pour ${id}`);
        const drawn = new Set(topology.objects.regions.geometries.map((g) => g.id));
        const missing = set.regions.filter((r) => !drawn.has(r.code)).map((r) => r.code);
        assert.deepEqual(missing, []);
      });

      it('acceptent leur propre nom et chacun de leurs alias', () => {
        for (const region of set.regions) {
          for (const answer of [region.name, ...region.nameAliases]) {
            const question = { mode: 'etats' as const, country: set.country, set: id, region };
            assert.ok(checkAnswer(question, answer).exact, `${region.code} refuse « ${answer} »`);
          }
        }
      });

      it('n’ont jamais un nom en commun', () => {
        const shared = sharedAnswers(set.regions.map((r) => ({ code: r.code, answers: [r.name, ...r.nameAliases] })));
        assert.deepEqual(Object.fromEntries(shared), {});
      });
    });
  }
});
