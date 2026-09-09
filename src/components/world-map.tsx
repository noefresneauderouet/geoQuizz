'use client';

import { geoArea, geoCentroid, geoMercator, geoPath } from 'd3-geo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import detailedAtlas from 'world-atlas/countries-50m.json';
import coarseAtlas from 'world-atlas/countries-110m.json';

import type { Category, CategoryId } from '@/constants/categories';
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
 * Marge autour du pays en vue zoomée : il occupe la part centrale
 * `1 - 2 × ZOOM_PADDING` du cadre, soit un peu moins d'un tiers.
 */
const ZOOM_PADDING = 0.35;

/**
 * Plafond de zoom, en degrés de longitude visibles.
 *
 * Sans lui, cadrer chaque pays sur la même part de l'écran zoome d'autant plus
 * fort que le pays est petit : la Sierra Leone ou l'Arménie se retrouvaient
 * entourées de 13° de contexte, le Luxembourg de 4° — plus rien de
 * reconnaissable autour. Le pays occupe donc une part variable du cadre, et
 * c'est voulu : c'est ce qui rend sa région identifiable.
 */
const MIN_VISIBLE_SPAN_DEG = 22;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Un pays plus petit que ce seuil (en pixels) reçoit un cercle de repérage.
 * La Dominique ou Bahreïn ne font que 6 px de large même au zoom maximal :
 * sans l'anneau, on ne les distinguerait pas d'un îlot quelconque.
 */
const MARKER_BELOW_PX = 16;
const MARKER_RADIUS_PX = 15;

/**
 * Une forme par code ISO.
 *
 * Natural Earth livre parfois plusieurs entités sous le même code : l'Australie
 * est séparée de ses îles Ashmore-et-Cartier. Les prendre telles quelles ferait
 * zoomer sur un récif de 2 km, alors on les fusionne par pays.
 */
function buildShapes(source: unknown): Shape[] {
  const features = (
    feature(
      source as never,
      (source as { objects: { countries: never } }).objects.countries
    ) as unknown as GeoJSON.FeatureCollection
  ).features.filter((f) => String(f.id) !== ANTARCTICA);

  const byId = new Map<string, GeoJSON.Position[][][]>();
  for (const f of features) {
    const id = String(f.id);
    const polygons =
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates]
        : (f.geometry as GeoJSON.MultiPolygon).coordinates;
    const existing = byId.get(id);
    if (existing) existing.push(...polygons);
    else byId.set(id, [...polygons]);
  }

  return [...byId].map(([id, coordinates]) => ({
    id,
    geometry: { type: 'MultiPolygon', coordinates } as GeoJSON.Geometry,
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
const WINDOWS: Record<Exclude<CategoryId, 'monde'>, Window> = {
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
 * Projette toutes les terres dans une boîte de width × height.
 *
 * `focus` est ce qui doit tenir dans le cadre : la fenêtre du continent en vue
 * d'ensemble, la partie continentale du pays en vue zoomée. `padRatio` laisse
 * de la marge, donc les pays voisins restent visibles autour du zoom.
 * `center` fait pivoter le globe pour amener la zone au centre, ce qui met
 * l'antiméridien hors champ (indispensable pour l'Océanie et les Fidji).
 * `scaleBounds`, s'il est fourni, borne le zoom des deux côtés : le cadrage
 * cesse alors de remplir l'écran avec le pays et le recentre sur `center`.
 * `fallback` est la position officielle du pays, utilisée pour poser l'anneau
 * quand le fond de carte ne contient aucune forme pour lui (Tuvalu).
 */
function project(
  focus: GeoJSON.GeoJsonObject,
  target: string,
  { width, height }: Size,
  padRatio: number,
  center: [number, number],
  fallback: [number, number],
  scaleBounds?: [min: number, max: number]
): Frame {
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
  // Sans clip, un zoom fort produit des tracés démesurés hors du cadre.
  // Avec, d3 renvoie null pour les pays entièrement invisibles.
  projection.clipExtent([
    [0, 0],
    [width, height],
  ]);
  const path = geoPath(projection);

  const land: string[] = [];
  for (const shape of projection.scale() > DETAIL_ABOVE_SCALE ? DETAILED : COARSE) {
    if (shape.id === target) continue;
    const d = path(shape.geometry as never);
    if (d) land.push(d);
  }

  // Le pays cherché vient toujours du fond détaillé : sept petits États
  // (Cap-Vert, Comores, Maurice…) sont absents du 110m et resteraient
  // invisibles en vue d'ensemble.
  let highlight = '';
  let marker: Frame['marker'] = null;
  const targetShape = DETAILED_BY_ID.get(target);

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
  height?: number;
};

export function WorldMap({ country, category, zoomed, scope, height = 260 }: Props) {
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
      return project(ALL_LAND, country.numeric, size, 0.02, [0, 0], position);
    }
    const window = WINDOWS[country.continent];
    const centerLon = (window[0][0] + window[1][0]) / 2;
    return project(windowFeature(window), country.numeric, size, 0.02, [centerLon, 0], position);
  }, [country, scope, size]);

  const close = useMemo(() => {
    if (!size) return null;
    const position = lonLat(country);
    const target = DETAILED_BY_ID.get(country.numeric);

    // Tuvalu n'a aucune forme, même en 1:50m : on cadre sur ses coordonnées
    // et l'anneau fait tout le travail.
    if (!target) {
      return project(
        pointWindow(position),
        country.numeric,
        size,
        ZOOM_PADDING,
        position,
        position,
        [size.width / (2 * Math.PI), size.width / (MIN_VISIBLE_SPAN_DEG * DEG_TO_RAD)]
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
      [size.width / (2 * Math.PI), size.width / (MIN_VISIBLE_SPAN_DEG * DEG_TO_RAD)]
    );
  }, [country, size]);

  const showClose = zoomed && close !== null;

  return (
    <div ref={container} className={styles.container} style={{ height }}>
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
