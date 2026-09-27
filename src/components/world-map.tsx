'use client';

import { geoArea, geoCentroid, geoMercator, geoPath } from 'd3-geo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { merge } from 'topojson-client';
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from 'topojson-specification';
import coarseAtlas from 'visionscarto-world-atlas/world/110m.json';
import detailedAtlas from 'visionscarto-world-atlas/world/50m.json';

import type { Category, ContinentId } from '@/constants/categories';
import { Palette } from '@/constants/theme';
import type { Country } from '@/lib/countries';

import styles from './world-map.module.css';

/** Une forme du fond de carte, prête à projeter. */
type Shape = { id: string; geometry: GeoJSON.Geometry };
type Size = { width: number; height: number };
type Frame = {
  land: string[];
  highlight: string;
  /** Cercle de repérage, seulement pour un pays trop petit pour se voir. */
  marker: { x: number; y: number } | null;
};
/** Fenêtre géographique en degrés : [[ouest, sud], [est, nord]]. */
type Window = [[number, number], [number, number]];

/** L'Antarctique n'apparaît jamais : en Mercator elle écrase toute la carte. */
const ANTARCTICA = '010';

/**
 * Territoires que Natural Earth détache et qu'on recolle.
 *
 * Chaque forme est tracée avec son contour : une entité séparée, c'est une
 * frontière dessinée. Le Somaliland coupait donc la Somalie en deux, Chypre du
 * Nord coupait Chypre, et le glacier de Siachen posait un trait au milieu du
 * Cachemire — des frontières qu'aucun atlas français ne trace. Les recoller à
 * l'État qui les administre répare du même coup la réponse : la Somalie
 * surlignée n'était que son tiers sud.
 *
 * Le Kosovo, lui, reste distinct : la France le reconnaît, et la Serbie du
 * fond de carte l'exclut déjà.
 */
const REATTACHED: Record<string, string> = {
  '-3': '706', // Somaliland → Somalie
  '-1': '196', // Chypre du Nord → Chypre
  KAS: '356', // glacier de Siachen → Inde
  IOA: '036', // territoires australiens de l'océan Indien → Australie
};

/**
 * Marge autour du pays en vue zoomée : il occupe la part centrale
 * `1 - 2 × ZOOM_PADDING` du cadre, soit un peu moins d'un tiers.
 */
const ZOOM_PADDING = 0.40;

/**
 * Pays étalon du plafond de zoom : l'Équateur.
 *
 * Sans plafond, cadrer chaque pays sur la même part de l'écran zoome d'autant
 * plus fort que le pays est petit : le Luxembourg se retrouvait entouré de 4°
 * de contexte, plus rien de reconnaissable autour. Aucun pays n'est donc zoomé
 * plus fort que l'Équateur cadré de la même façon : tous les pays plus petits
 * partagent exactement son échelle, seuls les plus grands dézooment pour
 * tenir. L'étalon est recalculé pour chaque taille de cadre — un plafond en
 * degrés fixes zoomait les petits pays bien plus que l'Équateur sur un écran
 * large.
 */
const ZOOM_REFERENCE = '218';


/**
 * Un pays plus petit que ce seuil (en pixels) reçoit un cercle de repérage.
 * La Dominique ou Bahreïn ne font que 6 px de large même au zoom maximal :
 * sans l'anneau, on ne les distinguerait pas d'un îlot quelconque.
 */
const MARKER_BELOW_PX = 16;
const MARKER_RADIUS_PX = 15;

/**
 * Marge de la vue d'ensemble, négative à dessein.
 *
 * La fenêtre du continent déborde donc le cadre de 12 % de chaque côté au lieu
 * de s'y inscrire. S'y inscrire imposait le plus contraignant des deux axes :
 * une fenêtre d'atlas plus haute que large laissait deux bandes de bleu sur
 * les côtés, et le pays cherché se réduisait à quelques pixels au milieu. Ce
 * qui déborde, ce sont les coins du continent — jamais le pays, que le cadrage
 * ramène toujours dans le cadre.
 */
const OVERVIEW_PADDING = -0.50;

/**
 * Garde entre le pays cherché et le bord latéral du cadre. Assez large pour
 * l'anneau de repérage (15 px de rayon, 4 px de trait) : c'est le pays qu'on
 * regarde, il ne doit jamais être coupé par le bord.
 */
const EDGE_MARGIN_PX = 24;

/**
 * Dernières terres au nord et au sud, Antarctique exclu : le Groenland et le
 * cap Horn. Elles bornent le recentrage vertical — au-delà, il ne monterait
 * plus que du bleu dans le cadre.
 */
const LAND_NORTH = 84;
const LAND_SOUTH = -56;

/**
 * Une forme par code ISO.
 *
 * Natural Earth livre parfois plusieurs entités sous le même code : l'Australie
 * est séparée de ses îles Ashmore-et-Cartier. Les prendre telles quelles ferait
 * zoomer sur un récif de 2 km, alors on les fusionne par pays.
 *
 * La fusion passe par `merge`, qui travaille sur la topologie et dissout les
 * arcs partagés. Recoller deux formes en concaténant leurs coordonnées aurait
 * laissé leur frontière commune tracée au milieu du pays.
 */
function buildShapes(source: unknown): Shape[] {
  const topology = source as Topology;
  const parts = new Map<string, (Polygon | MultiPolygon)[]>();

  for (const geometry of (topology.objects.countries as GeometryCollection).geometries) {
    const code = String(geometry.id);
    if (code === ANTARCTICA) continue;
    const id = REATTACHED[code] ?? code;
    const group = parts.get(id);
    if (group) group.push(geometry as Polygon | MultiPolygon);
    else parts.set(id, [geometry as Polygon | MultiPolygon]);
  }

  return [...parts].map(([id, geometries]) => ({
    id,
    geometry: merge(topology, geometries) as GeoJSON.Geometry,
  }));
}

/**
 * Deux fonds de carte, choisis selon l'échelle.
 *
 * Le 50m donne des frontières fidèles mais pèse jusqu'à 1,4 Mo de tracés SVG
 * pour une vue continentale — et on en affiche deux couches à la fois pendant
 * le fondu. À l'échelle d'un continent le 110m est visuellement identique pour
 * un dixième du poids ; le 50m ne sert qu'une fois zoomé, là où ses détails se
 * voient vraiment et où peu de pays tiennent dans le cadre.
 */
const DETAILED = buildShapes(detailedAtlas);
const COARSE = buildShapes(coarseAtlas);
const DETAILED_BY_ID = new Map(DETAILED.map((s) => [s.id, s]));

/** Au-delà de cette échelle, le 110m devient visiblement anguleux. */
const DETAIL_ABOVE_SCALE = 300;

/**
 * Le 110m complété des États qu'il ignore, pris au 50m.
 *
 * C'est le fond de la vue zoomée sous DETAIL_ABOVE_SCALE. Le 110m seul y
 * effaçait les voisins d'une île : clavier ouvert, le cadre perd la moitié de
 * sa hauteur, l'échelle retombe sous le seuil, et Samoa, Tuvalu ou la Grenade,
 * absents du 110m, disparaissaient autour de Tonga ou de Saint-Vincent. Ces
 * petits États pèsent peu : les ajouter ne coûte presque rien.
 */
const COARSE_IDS = new Set(COARSE.map((s) => s.id));
const COARSE_COMPLETE = [...COARSE, ...DETAILED.filter((s) => !COARSE_IDS.has(s.id))];


const ALL_LAND: GeoJSON.GeoJsonObject = {
  type: 'FeatureCollection',
  features: COARSE.map((s) => ({ type: 'Feature', properties: {}, geometry: s.geometry })),
} as GeoJSON.GeoJsonObject;

/**
 * Cadrage de chaque vue d'ensemble.
 *
 * On ne cadre pas sur l'emprise réelle des pays du continent : la Russie file
 * jusqu'à 180°E et la France jusqu'en Guyane, ce qui ramènerait la vue
 * « Europe » à une mappemonde. Ces fenêtres sont celles d'un atlas classique.
 */
const WINDOWS: Record<ContinentId, Window> = {
  afrique: [
    [-20, -37],
    [53, 39],
  ],
  amerique: [
    [-170, -57],
    [-32, 72],
  ],
  asie: [
    [25, -11],
    [150, 78],
  ],
  europe: [
    [-25, 34],
    [46, 72],
  ],
  // Va au-delà de 180° : la rotation de la projection évite la coupure.
  // Monte jusqu'à 22°N pour englober la Micronésie et les Îles Marshall,
  // qui sinon sortaient du cadre par le haut.
  oceanie: [
    [110, -50],
    [190, 22],
  ],
};

/**
 * L'anneau tourne dans le sens horaire, et c'est volontaire : d3 lit les
 * polygones sur la sphère, où le sens inverse désignerait « toute la planète
 * sauf cette boîte » — la vue Europe redeviendrait alors une mappemonde.
 */
function windowFeature([[west, south], [east, north]]: Window): GeoJSON.GeoJsonObject {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    ],
  } as GeoJSON.GeoJsonObject;
}

/** countries.json stocke [latitude, longitude] ; d3 attend l'inverse. */
function lonLat(country: Country): [number, number] {
  return [country.latlng[1], country.latlng[0]];
}

/** Minuscule fenêtre autour d'un point, pour cadrer un pays sans forme. */
function pointWindow([lon, lat]: [number, number]): GeoJSON.GeoJsonObject {
  const delta = 0.05;
  return windowFeature([
    [lon - delta, lat - delta],
    [lon + delta, lat + delta],
  ]);
}

/**
 * Le plus grand morceau d'un pays — sa partie continentale. Cadrer le zoom sur
 * la géométrie complète de la France l'étirerait jusqu'à la Guyane, celle des
 * États-Unis jusqu'à l'Alaska.
 */
function mainland(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geometry.type !== 'MultiPolygon') return geometry;
  let best = geometry.coordinates[0];
  let bestArea = 0;
  for (const coordinates of geometry.coordinates) {
    const area = geoArea({ type: 'Polygon', coordinates } as never);
    if (area > bestArea) {
      bestArea = area;
      best = coordinates;
    }
  }
  return { type: 'Polygon', coordinates: best };
}

/**
 * Décalage horizontal ramenant l'intervalle [min, max] dans un cadre de
 * `extent` pixels, avec `margin` de garde. Une forme trop large pour le cadre
 * est centrée : la Russie ne tient dans aucune vue, autant la montrer par le
 * milieu.
 */
function slideX(min: number, max: number, extent: number, margin: number): number {
  if (max - min > extent - 2 * margin) return extent / 2 - (min + max) / 2;
  if (min < margin) return margin - min;
  if (max > extent - margin) return extent - margin - max;
  return 0;
}

/**
 * Décalage vertical amenant l'intervalle [top, bottom] à mi-hauteur du cadre.
 *
 * Sans lui, les pays s'entassaient dans le bas de la vue d'ensemble : Mercator
 * étire les hautes latitudes, donc le nord d'une fenêtre d'atlas mange la
 * moitié des pixels — la Grèce se retrouvait à 89 % de la hauteur, Chypre à
 * 93 %. `north` et `south` bornent le mouvement à la bande des terres : la
 * mappemonde, plus courte que le cadre sur un écran haut, ne bouge pas du tout
 * plutôt que de laisser monter une bande de bleu.
 */
function centerY(top: number, bottom: number, extent: number, north: number, south: number): number {
  if (south - north <= extent) return 0;
  return Math.min(Math.max(extent / 2 - (top + bottom) / 2, extent - south), -north);
}

/**
 * Bornes du zoom sur un pays, en échelle de projection : du globe entier à
 * l'échelle de l'Équateur (ZOOM_REFERENCE) cadré dans le même cadre.
 */
function zoomBounds({ width, height }: Size): [number, number] {
  const min = width / (2 * Math.PI);
  const reference = DETAILED_BY_ID.get(ZOOM_REFERENCE);
  if (!reference) return [min, width / (22 * (Math.PI / 180))];
  const core = mainland(reference.geometry);
  const projection = geoMercator()
    .rotate([-geoCentroid(core as never)[0], 0])
    .fitExtent(
      [
        [width * ZOOM_PADDING, height * ZOOM_PADDING],
        [width * (1 - ZOOM_PADDING), height * (1 - ZOOM_PADDING)],
      ],
      core as never
    );
  return [min, Math.max(min, projection.scale())];
}

/** Réglages propres à l'une des deux vues. */
type Framing = {
  /** Borne le zoom des deux côtés ; le cadrage recentre alors sur `center`. */
  scaleBounds?: [min: number, max: number];
  /**
   * Autorise le fond 50m quand l'échelle le justifie.
   *
   * Seule la vue zoomée le demande : c'est là qu'on lit la forme d'un pays. La
   * vue d'ensemble s'en passe quelle que soit son échelle — ce qu'elle dessine
   * autour du pays n'est que du contexte, et le pays cherché, lui, vient
   * toujours du 50m. Elle couvre un continent entier : le 50m y coûterait
   * 30 ms de projection et 200 ko de tracés à chaque question.
   *
   * Sous le seuil, la vue zoomée garde les petits États (COARSE_COMPLETE) :
   * autour d'une île, ses voisines sont le seul repère.
   */
  detail?: boolean;
};

/**
 * Projette toutes les terres dans une boîte de width × height.
 *
 * `focus` est ce qui doit tenir dans le cadre : la fenêtre du continent en vue
 * d'ensemble, la partie continentale du pays en vue zoomée. `padRatio` laisse
 * de la marge autour ; négatif, il fait au contraire déborder `focus` du cadre.
 * `center` fait pivoter le globe pour amener la zone au centre, ce qui met
 * l'antiméridien hors champ (indispensable pour l'Océanie et les Fidji).
 * `fallback` est la position officielle du pays, utilisée pour poser l'anneau
 * quand le fond de carte ne contient aucune forme pour lui.
 */
function project(
  focus: GeoJSON.GeoJsonObject,
  target: string,
  { width, height }: Size,
  padRatio: number,
  center: [number, number],
  fallback: [number, number],
  { scaleBounds, detail = false }: Framing = {}
): Frame {
  const targetShape = DETAILED_BY_ID.get(target);
  const projection = geoMercator().rotate([-center[0], 0]);
  projection.fitExtent(
    [
      [width * padRatio, height * padRatio],
      [width * (1 - padRatio), height * (1 - padRatio)],
    ],
    focus as never
  );

  if (scaleBounds) {
    const fitted = projection.scale();
    const clamped = Math.min(Math.max(fitted, scaleBounds[0]), scaleBounds[1]);
    if (clamped !== fitted) {
      // fitExtent avait réglé translate pour un zoom qu'on refuse : on repose
      // le pays au centre du cadre à l'échelle retenue.
      projection.scale(clamped).translate([width / 2, height / 2]);
      const projected = projection(center);
      if (projected) {
        projection.translate([width - projected[0], height - projected[1]]);
      }
    }
  }
  // Le cadrage précédent centre la zone, pas le pays. On pose donc le pays à
  // mi-hauteur, et on le ramène dans le cadre horizontalement s'il touchait le
  // bord — Chypre, l'Islande. La vue découvre alors les terres voisines, ce qui
  // vaut mieux que de rogner le pays cherché.
  const anchor = projection(fallback);
  const bounds = targetShape
    ? geoPath(projection).bounds(mainland(targetShape.geometry) as never)
    : anchor
      ? ([anchor, anchor] as [[number, number], [number, number]])
      : null;
  if (bounds && Number.isFinite(bounds[0][0])) {
    const [[x0, y0], [x1, y1]] = bounds;
    const [tx, ty] = projection.translate();
    const north = projection([center[0], LAND_NORTH])?.[1] ?? 0;
    const south = projection([center[0], LAND_SOUTH])?.[1] ?? height;
    projection.translate([
      tx + slideX(x0, x1, width, EDGE_MARGIN_PX),
      ty + centerY(y0, y1, height, north, south),
    ]);
  }

  // Sans clip, un zoom fort produit des tracés démesurés hors du cadre.
  // Avec, d3 renvoie null pour les pays entièrement invisibles.
  projection.clipExtent([
    [0, 0],
    [width, height],
  ]);
  const path = geoPath(projection);

  const land: string[] = [];
  const base = !detail
    ? COARSE
    : projection.scale() > DETAIL_ABOVE_SCALE
      ? DETAILED
      : COARSE_COMPLETE;
  for (const shape of base) {
    if (shape.id === target) continue;
    const d = path(shape.geometry as never);
    if (d) land.push(d);
  }

  // Le pays cherché vient toujours du fond détaillé : vingt-neuf petits États
  // (Malte, Singapour, Cap-Vert…) sont absents du 110m et resteraient
  // invisibles en vue d'ensemble.
  let highlight = '';
  let marker: Frame['marker'] = null;

  if (targetShape) {
    highlight = path(targetShape.geometry as never) ?? '';
    const [[x0, y0], [x1, y1]] = path.bounds(targetShape.geometry as never);
    if (highlight && Number.isFinite(x0) && Math.max(x1 - x0, y1 - y0) < MARKER_BELOW_PX) {
      marker = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    }
  }

  // Aucune forme dans le fond de carte : on pose l'anneau sur les coordonnées
  // officielles du pays, sinon il n'y aurait rien du tout à montrer.
  if (!highlight) {
    const point = projection(fallback);
    if (point && point[0] >= 0 && point[0] <= width && point[1] >= 0 && point[1] <= height) {
      marker = { x: point[0], y: point[1] };
    }
  }

  return { land, highlight, marker };
}

type Props = {
  country: Country;
  category: Category;
  /** false = vue d'ensemble, true = zoom sur le pays. */
  zoomed: boolean;
  /** « monde » cadre sur la planète entière, sinon sur le continent du pays. */
  scope: 'continent' | 'monde';
};

export function WorldMap({ country, category, zoomed, scope }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);

  /*
   * La projection a besoin des dimensions réelles du cadre, que seul le
   * navigateur connaît. Un ResizeObserver les suit — y compris au changement
   * d'orientation ou quand le clavier virtuel redimensionne la fenêtre.
   */
  useEffect(() => {
    const element = container.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height: measured } = entry.contentRect;
      if (width === 0 || measured === 0) return;
      setSize((prev) =>
        prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - measured) < 1
          ? prev
          : { width, height: measured }
      );
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const wide = useMemo(() => {
    if (!size) return null;
    const position = lonLat(country);
    if (scope === 'monde') {
      return project(ALL_LAND, country.numeric, size, OVERVIEW_PADDING, [0, 0], position);
    }
    const window = WINDOWS[country.continent];
    const centerLon = (window[0][0] + window[1][0]) / 2;
    return project(
      windowFeature(window),
      country.numeric,
      size,
      OVERVIEW_PADDING,
      [centerLon, 0],
      position
    );
  }, [country, scope, size]);

  const close = useMemo(() => {
    if (!size) return null;
    const position = lonLat(country);
    const target = DETAILED_BY_ID.get(country.numeric);
    const scaleBounds = zoomBounds(size);

    // Un pays absent du fond de carte : on cadre sur ses coordonnées et
    // l'anneau fait tout le travail. Les 196 en ont une depuis le passage au
    // fond Visionscarto — le précédent ignorait Tuvalu —, mais la garde reste :
    // le fond de carte n'est pas gravé dans le marbre.
    if (!target) {
      return project(
        pointWindow(position),
        country.numeric,
        size,
        ZOOM_PADDING,
        position,
        position,
        { scaleBounds, detail: true }
      );
    }

    const core = mainland(target.geometry);
    // On centre le globe sur le pays : les voisins restent visibles autour,
    // et un pays à cheval sur l'antiméridien n'est pas coupé en deux.
    // La marge est généreuse à dessein. Le plafond haut empêche les petits
    // pays de remplir l'écran sans repère alentour ; le plafond bas empêche
    // la Russie, large de 171°, de dézoomer au-delà du globe (la carte se
    // répéterait horizontalement).
    return project(
      core as never,
      country.numeric,
      size,
      ZOOM_PADDING,
      geoCentroid(core as never) as [number, number],
      position,
      { scaleBounds, detail: true }
    );
  }, [country, size]);

  const showClose = zoomed && close !== null;

  return (
    <div ref={container} className={styles.container}>
      {size && wide ? (
        <MapLayer frame={wide} category={category} size={size} hidden={showClose} />
      ) : null}
      {size && close ? (
        <MapLayer frame={close} category={category} size={size} hidden={!showClose} />
      ) : null}
    </div>
  );
}

/**
 * Une des deux vues. Les deux sont montées en permanence et se croisent par
 * l'opacité : reprojeter à chaque bascule aurait fait sauter l'image, la
 * projection d'un continent coûtant plusieurs dizaines de millisecondes.
 */
function MapLayer({
  frame,
  category,
  size,
  hidden,
}: {
  frame: Frame;
  category: Category;
  size: Size;
  hidden: boolean;
}) {
  return (
    <svg
      className={styles.layer}
      width={size.width}
      height={size.height}
      style={{ opacity: hidden ? 0 : 1 }}
      aria-hidden="true">
      <rect x={0} y={0} width={size.width} height={size.height} fill={Palette.blueLight} />
      {frame.land.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={category.map.land}
          stroke={category.map.stroke}
          strokeOpacity={0.35}
          strokeWidth={0.5}
        />
      ))}
      {frame.highlight ? (
        <path
          d={frame.highlight}
          fill={category.map.highlight}
          stroke={Palette.ink}
          strokeWidth={1.2}
        />
      ) : null}
      {frame.marker ? (
        <>
          <circle
            cx={frame.marker.x}
            cy={frame.marker.y}
            r={MARKER_RADIUS_PX}
            fill="none"
            stroke={Palette.card}
            strokeWidth={4}
            strokeOpacity={0.8}
          />
          <circle
            cx={frame.marker.x}
            cy={frame.marker.y}
            r={MARKER_RADIUS_PX}
            fill="none"
            stroke={category.map.highlight}
            strokeWidth={2.5}
          />
        </>
      ) : null}
    </svg>
  );
}
