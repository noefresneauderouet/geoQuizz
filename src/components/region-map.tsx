'use client';

import {
  geoAlbers,
  geoConicConformal,
  geoConicEqualArea,
  geoPath,
  type GeoPath,
  type GeoProjection,
} from 'd3-geo';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import atlas from 'visionscarto-world-atlas/world/50m.json';

import type { Category, RegionSetId } from '@/constants/categories';
import { Palette } from '@/constants/theme';
import rawShapes from '@/data/region-shapes.json';
import { regionSet } from '@/lib/regions';

import styles from './region-map.module.css';

type Size = { width: number; height: number };
/** [[gauche, haut], [droite, bas]] */
type Box = [[number, number], [number, number]];
type Shape = GeoJSON.Feature;
type Drawn = { code: string; d: string; bounds: Box };
type InsetFrame = { x: number; y: number; width: number; height: number; regions: Drawn[] };
type Drawing = { land: string[]; regions: Drawn[]; insets: InsetFrame[] };

/** Un territoire trop loin du reste pour tenir sur la même carte. */
type Inset = {
  regions: string[];
  projection: () => GeoProjection;
  /** Place de l'encart, en fractions du cadre. */
  box: Box;
  /**
   * Ce que l'encart cadre, en degrés [[ouest, sud], [est, nord]], quand ce
   * n'est pas la région entière : les Aléoutiennes filent jusqu'à 172° est et
   * réduisaient l'Alaska à un timbre.
   */
  window?: Box;
};

type Layout = {
  /** Projection du pays, que le cadrage met ensuite à l'échelle. */
  projection: () => GeoProjection;
  /** Part du cadre laissée à la carte principale, en fractions : les encarts prennent le reste. */
  frame?: Box;
  insets?: Inset[];
};

/**
 * Une projection par pays, celle de ses atlas. Mercator, qui sert à la carte
 * du monde, étire les hautes latitudes : le nord de la Chine ou des
 * États-Unis y enflerait. Les coniques gardent formes et surfaces à
 * l'échelle d'un pays.
 *
 * L'Alaska, Hawaï et les Canaries vont en encart, en bas à gauche, comme dans
 * tous les atlas : cadrés avec le reste, ils ramèneraient le pays à un timbre.
 */
const LAYOUTS: Record<RegionSetId, Layout> = {
  'etats-unis': {
    // Albers, parallèles 29,5° et 45,5° : la projection de référence des États-Unis.
    projection: () => geoAlbers(),
    frame: [
      [0, 0],
      [1, 0.8],
    ],
    insets: [
      {
        regions: ['US-AK'],
        projection: () => geoConicEqualArea().rotate([154, 0]).parallels([55, 65]),
        box: [
          [0, 0.68],
          [0.28, 1],
        ],
        window: [
          [-170, 52],
          [-130, 71.5],
        ],
      },
      {
        regions: ['US-HI'],
        projection: () => geoConicEqualArea().rotate([157, 0]).parallels([8, 18]),
        box: [
          [0.28, 0.8],
          [0.44, 1],
        ],
      },
    ],
  },
  // Lambert conique conforme, celle de l'IGN.
  france: { projection: () => geoConicConformal().rotate([-3, 0]).parallels([44, 49]) },
  espagne: {
    projection: () => geoConicConformal().rotate([3.5, 0]).parallels([37, 43]),
    frame: [
      [0, 0],
      [1, 0.82],
    ],
    insets: [
      {
        regions: ['ES-CN'],
        projection: () => geoConicConformal().rotate([15.7, 0]).parallels([27.5, 29.5]),
        box: [
          [0, 0.8],
          [0.34, 1],
        ],
      },
    ],
  },
  chine: { projection: () => geoConicEqualArea().rotate([-105, 0]).parallels([25, 47]) },
};

/** Marge entre le pays et le bord du cadre, ou d'un encart. */
const PADDING_PX = 8;

/**
 * Zoom sur la région : elle occupe alors la part centrale `1 - 2 × ZOOM_PADDING`
 * du cadre, sans dépasser MAX_ZOOM — au-delà, les tracés simplifiés se
 * voient, et plus rien n'est reconnaissable autour.
 */
const ZOOM_PADDING = 0.3;
const MAX_ZOOM = 6;
/** En dessous, le zoom n'apporte rien : la région est déjà bien visible. */
const MIN_USEFUL_ZOOM = 1.3;

/** Comme sur la carte du monde : une région plus petite reçoit un anneau. */
const MARKER_BELOW_PX = 16;
const MARKER_RADIUS_PX = 15;

const ANTARCTICA = '010';
const SHAPES = rawShapes as unknown as Record<RegionSetId, Topology>;

function featuresOf(topology: Topology, name: string): Shape[] {
  const object = topology.objects[name] as GeometryCollection;
  return (feature(topology, object) as GeoJSON.FeatureCollection).features;
}

const collection = (features: Shape[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features,
});

/**
 * Une fenêtre en degrés, en polygone. L'anneau tourne dans le sens horaire,
 * comme sur la carte du monde : d3 lit les polygones sur la sphère, où le
 * sens inverse désignerait toute la planète sauf cette boîte.
 */
function windowPolygon([[west, south], [east, north]]: Box): GeoJSON.Polygon {
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
  };
}

/* Lus à la première carte, pas au chargement du module : l'écran de jeu
   l'importe pour tous les modes. */
let world: Shape[] | null = null;
const regionsBySet = new Map<RegionSetId, Shape[]>();

function worldShapes(): Shape[] {
  world ??= featuresOf(atlas as unknown as Topology, 'countries').filter(
    (s) => String(s.id) !== ANTARCTICA,
  );
  return world;
}

function regionShapes(set: RegionSetId): Shape[] {
  let shapes = regionsBySet.get(set);
  if (!shapes) {
    shapes = featuresOf(SHAPES[set], 'regions');
    regionsBySet.set(set, shapes);
  }
  return shapes;
}

function drawn(shape: Shape, path: GeoPath): Drawn {
  return { code: String(shape.id), d: path(shape) ?? '', bounds: path.bounds(shape) };
}

/**
 * Projette le pays dans le cadre, puis ses encarts.
 *
 * Les voisins viennent du fond de carte du mode « Pays » : ils situent le
 * pays sans rien lui disputer, en teinte plus pâle. Le pays lui-même en est
 * retiré, ses régions prennent sa place.
 */
function draw(set: RegionSetId, { width, height }: Size): Drawing {
  const layout = LAYOUTS[set];
  const insets = layout.insets ?? [];
  const inInset = new Set(insets.flatMap((inset) => inset.regions));
  const shapes = regionShapes(set);
  const main = shapes.filter((s) => !inInset.has(String(s.id)));

  const [[fx0, fy0], [fx1, fy1]] = layout.frame ?? [
    [0, 0],
    [1, 1],
  ];
  const projection = layout.projection().fitExtent(
    [
      [fx0 * width + PADDING_PX, fy0 * height + PADDING_PX],
      [fx1 * width - PADDING_PX, fy1 * height - PADDING_PX],
    ],
    collection(main),
  );
  // Sans clip, les voisins lointains produiraient des tracés démesurés.
  projection.clipExtent([
    [0, 0],
    [width, height],
  ]);
  const path = geoPath(projection);

  const { numeric } = regionSet(set).country;
  const land = worldShapes()
    .filter((s) => String(s.id) !== numeric)
    .flatMap((s) => path(s) ?? []);

  return {
    land,
    regions: main.map((s) => drawn(s, path)),
    insets: insets.map(({ regions, projection: insetProjection, box, window }) => {
      const [[bx0, by0], [bx1, by1]] = box;
      const x = bx0 * width;
      const y = by0 * height;
      const w = (bx1 - bx0) * width;
      const h = (by1 - by0) * height;
      const members = shapes.filter((s) => regions.includes(String(s.id)));
      const inset = insetProjection().fitExtent(
        [
          [x + PADDING_PX, y + PADDING_PX],
          [x + w - PADDING_PX, y + h - PADDING_PX],
        ],
        window ? windowPolygon(window) : collection(members),
      );
      inset.clipExtent([
        [x, y],
        [x + w, y + h],
      ]);
      return { x, y, width: w, height: h, regions: members.map((s) => drawn(s, geoPath(inset))) };
    }),
  };
}

/*
 * La dernière carte projetée, gardée hors du composant : l'écran de jeu le
 * remonte à chaque question (sa `key` rejoue l'animation d'entrée), ce qui
 * reprojetait tout le pays, 50 ms à chaque fois. D'une question à l'autre,
 * seuls la région surlignée et le zoom changent.
 */
let lastDrawing: { set: RegionSetId; size: Size; drawing: Drawing } | null = null;

function drawOnce(set: RegionSetId, size: Size): Drawing {
  if (
    lastDrawing?.set !== set ||
    lastDrawing.size.width !== size.width ||
    lastDrawing.size.height !== size.height
  ) {
    lastDrawing = { set, size, drawing: draw(set, size) };
  }
  return lastDrawing.drawing;
}

type Zoom = { k: number; x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Le zoom cadrant la région. La translation reste bornée : la carte agrandie
 * couvre toujours tout le cadre, sans laisser paraître son bord.
 */
function zoomOn([[x0, y0], [x1, y1]]: Box, { width, height }: Size): Zoom {
  const fit = Math.min(
    (width * (1 - 2 * ZOOM_PADDING)) / Math.max(x1 - x0, 1),
    (height * (1 - 2 * ZOOM_PADDING)) / Math.max(y1 - y0, 1),
  );
  const k = clamp(fit, 1, MAX_ZOOM);
  return {
    k,
    x: clamp(width / 2 - (k * (x0 + x1)) / 2, width - k * width, 0),
    y: clamp(height / 2 - (k * (y0 + y1)) / 2, height - k * height, 0),
  };
}

const NO_ZOOM: Zoom = { k: 1, x: 0, y: 0 };

type Props = {
  set: RegionSetId;
  /** Code ISO 3166-2 de la région cherchée. */
  region: string;
  category: Category;
  zoomed: boolean;
  /**
   * Le bouton de zoom, affiché sous la carte seulement s'il sert : Xinjiang
   * ou la Nouvelle-Aquitaine sont déjà assez grands pour se passer de lui.
   */
  zoomButton: ReactNode;
};

export function RegionMap({ set, region, category, zoomed, zoomButton }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);

  // Mêmes mesures que la carte du monde : le cadre suit la fenêtre et le clavier.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      setSize((prev) =>
        prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const drawing = useMemo(() => (size ? drawOnce(set, size) : null), [set, size]);

  const target = drawing
    ? [...drawing.regions, ...drawing.insets.flatMap((inset) => inset.regions)].find(
        (r) => r.code === region,
      )
    : undefined;
  const fit = target && size ? zoomOn(target.bounds, size) : NO_ZOOM;
  const zoomable = fit.k >= MIN_USEFUL_ZOOM;
  const zoom = zoomed && zoomable ? fit : NO_ZOOM;

  // L'anneau est posé hors du groupe agrandi : il garde sa taille à l'écran.
  let marker: { x: number; y: number } | null = null;
  if (target) {
    const [[x0, y0], [x1, y1]] = target.bounds;
    if (Math.max(x1 - x0, y1 - y0) * zoom.k < MARKER_BELOW_PX) {
      marker = { x: zoom.x + (zoom.k * (x0 + x1)) / 2, y: zoom.y + (zoom.k * (y0 + y1)) / 2 };
    }
  }

  const regionPath = (r: Drawn) => (
    <path
      key={r.code}
      d={r.d}
      fill={category.map.land}
      stroke={category.map.stroke}
      strokeOpacity={0.7}
      strokeWidth={0.8}
      vectorEffect="non-scaling-stroke"
    />
  );

  return (
    <>
      <div ref={container} className={styles.container}>
        {size && drawing ? (
          <svg className={styles.map} width={size.width} height={size.height} aria-hidden="true">
            <g
              className={styles.zoom}
              style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.k})` }}>
              <rect width={size.width} height={size.height} fill={Palette.blueLight} />
              {drawing.land.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill={category.map.land}
                  fillOpacity={0.45}
                  stroke={category.map.stroke}
                  strokeOpacity={0.25}
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {drawing.regions.map(regionPath)}
              {drawing.insets.map((inset) => (
                <g key={inset.regions.map((r) => r.code).join()}>
                  <rect
                    x={inset.x}
                    y={inset.y}
                    width={inset.width}
                    height={inset.height}
                    fill={Palette.blueLight}
                    stroke={category.map.stroke}
                    strokeOpacity={0.5}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                  {inset.regions.map(regionPath)}
                </g>
              ))}
              {target ? (
                <path
                  d={target.d}
                  fill={category.map.highlight}
                  stroke={Palette.ink}
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </g>
            {marker ? (
              <>
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  r={MARKER_RADIUS_PX}
                  fill="none"
                  stroke={Palette.card}
                  strokeWidth={4}
                  strokeOpacity={0.8}
                />
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  r={MARKER_RADIUS_PX}
                  fill="none"
                  stroke={category.map.highlight}
                  strokeWidth={2.5}
                />
              </>
            ) : null}
          </svg>
        ) : null}
      </div>
      {zoomable ? zoomButton : null}
    </>
  );
}
