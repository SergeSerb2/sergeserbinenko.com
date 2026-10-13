/**
 * Every place the site can travel to. Photos come from Unsplash (hand-picked
 * from the T3 Pretty seed pool) and are hotlinked through the Unsplash imgix
 * CDN, which handles sizing and AVIF/WebP negotiation.
 *
 * - `color` is Unsplash's average color: the wash shown while the photo loads
 *   and the whole backdrop when scenery is turned off.
 * - `accent` tints dots, rules, and focus rings while the place is on screen.
 * - `focal` is the CSS object-position that keeps the subject in frame.
 */
export interface Scene {
  place: string;
  /** Short name set huge behind a stop and sliding as you scroll. */
  word: string;
  coords: string;
  /** IANA time zone of the place, for the caption's local time. */
  tz: string;
  photo: string;
  unsplashId: string;
  photographer: string;
  photographerUrl: string;
  color: string;
  accent: string;
  focal: string;
}

export const scenes = {
  "tofino": {
    place: "Tofino, Canada",
    word: "Tofino",
    coords: "49.15° N, 125.91° W",
    tz: "America/Vancouver",
    photo: "https://images.unsplash.com/photo-1731006989672-a2dabbd87e64",
    unsplashId: "aBuKMrZi2Os",
    photographer: "Condor Wei",
    photographerUrl: "https://unsplash.com/@cwcanchn",
    color: "#738c8c",
    accent: "oklch(72% 0.13 88)",
    focal: "50% 62%",
  },
  "moraine": {
    place: "Moraine Lake, Canada",
    word: "Moraine",
    coords: "51.32° N, 116.18° W",
    tz: "America/Edmonton",
    photo: "https://images.unsplash.com/photo-1506104489822-562ca25152fe",
    unsplashId: "gdQnsMbhkUs",
    photographer: "Redd Francisco",
    photographerUrl: "https://unsplash.com/@reddfrancisco",
    color: "#c0d9d9",
    accent: "oklch(64% 0.1 200)",
    focal: "50% 50%",
  },
  "lofoten": {
    place: "Lofoten, Norway",
    word: "Lofoten",
    coords: "67.93° N, 13.09° E",
    tz: "Europe/Oslo",
    photo: "https://images.unsplash.com/photo-1663428520845-056989f8a664",
    unsplashId: "ut7XZMquCoU",
    photographer: "Benoît Deschasaux",
    photographerUrl: "https://unsplash.com/@benowa",
    color: "#264059",
    accent: "oklch(58% 0.17 28)",
    focal: "62% 50%",
  },
  "los-roques": {
    place: "Los Roques, Venezuela",
    word: "Los Roques",
    coords: "11.85° N, 66.76° W",
    tz: "America/Caracas",
    photo: "https://images.unsplash.com/photo-1637407412556-9a29c2d6793e",
    unsplashId: "Ezeff1I0Qzw",
    photographer: "Jorge Brito",
    photographerUrl: "https://unsplash.com/@legallyguaricho",
    color: "#c0d9f3",
    accent: "oklch(68% 0.12 195)",
    focal: "35% 60%",
  },
  "seoul": {
    place: "Seoul, South Korea",
    word: "Seoul",
    coords: "37.57° N, 126.98° E",
    tz: "Asia/Seoul",
    photo: "https://images.unsplash.com/photo-1645451365229-676df30167f0",
    unsplashId: "x1-4c42c8k4",
    photographer: "Clark Gu",
    photographerUrl: "https://unsplash.com/@atluminon",
    color: "#0c2626",
    accent: "oklch(68% 0.17 300)",
    focal: "50% 65%",
  },
  "skye": {
    place: "Isle of Skye, Scotland",
    word: "Skye",
    coords: "57.50° N, 6.16° W",
    tz: "Europe/London",
    photo: "https://images.unsplash.com/photo-1546706872-9c90b8d0c94f",
    unsplashId: "fUZWpaUknyI",
    photographer: "Reuben Teo",
    photographerUrl: "https://unsplash.com/@reubenteo",
    color: "#c0c0c0",
    accent: "oklch(60% 0.1 140)",
    focal: "62% 55%",
  },
  "tofino-dusk": {
    place: "Tofino, Canada",
    word: "Tofino",
    coords: "49.15° N, 125.91° W",
    tz: "America/Vancouver",
    photo: "https://images.unsplash.com/photo-1680125533385-eb2bb7464c48",
    unsplashId: "cvIKDPfcHqw",
    photographer: "alex geerts",
    photographerUrl: "https://unsplash.com/@alexgeerts",
    color: "#d9d9d9",
    accent: "oklch(72% 0.15 55)",
    focal: "35% 50%",
  },
  "faroe": {
    place: "Faroe Islands, Denmark",
    word: "Faroe",
    coords: "62.10° N, 7.43° W",
    tz: "Atlantic/Faroe",
    photo: "https://images.unsplash.com/photo-1563555856467-9c34d536240b",
    unsplashId: "0Am44gefIUs",
    photographer: "Conor Rees",
    photographerUrl: "https://unsplash.com/@conorrees",
    color: "#f3f3f3",
    accent: "oklch(62% 0.12 145)",
    focal: "60% 55%",
  },
  "kyoto": {
    place: "Kyoto, Japan",
    word: "Kyoto",
    coords: "34.99° N, 135.78° E",
    tz: "Asia/Tokyo",
    photo: "https://images.unsplash.com/photo-1578469645742-46cae010e5d4",
    unsplashId: "gd3ysFyrsTQ",
    photographer: "Cosmin Georgian",
    photographerUrl: "https://unsplash.com/@cosmingeorgian",
    color: "#c0f3f3",
    accent: "oklch(62% 0.16 40)",
    focal: "40% 60%",
  },
  "seceda": {
    place: "Seceda, Italy",
    word: "Seceda",
    coords: "46.60° N, 11.72° E",
    tz: "Europe/Rome",
    photo: "https://images.unsplash.com/photo-1663806260665-ca5c96bf0110",
    unsplashId: "2fBxIn9YniI",
    photographer: "Andrew Spencer",
    photographerUrl: "https://unsplash.com/@iam_aspencer",
    color: "#d9d9f3",
    accent: "oklch(64% 0.07 150)",
    focal: "55% 55%",
  },
  "maligne": {
    place: "Maligne Lake, Canada",
    word: "Maligne",
    coords: "52.68° N, 117.54° W",
    tz: "America/Edmonton",
    photo: "https://images.unsplash.com/photo-1587381419916-78fc843a36f8",
    unsplashId: "g5WFdL5Cub0",
    photographer: "Chris Czermak",
    photographerUrl: "https://unsplash.com/@chris_czermak",
    color: "#f3f3f3",
    accent: "oklch(66% 0.11 205)",
    focal: "55% 55%",
  },
  "peyto": {
    place: "Peyto Lake, Canada",
    word: "Peyto",
    coords: "51.72° N, 116.51° W",
    tz: "America/Edmonton",
    photo: "https://images.unsplash.com/photo-1576547756401-f9e122d87431",
    unsplashId: "-QbVBqWlOJg",
    photographer: "Tevin Trinh",
    photographerUrl: "https://unsplash.com/@tevintrinh",
    color: "#8cc0d9",
    accent: "oklch(70% 0.12 210)",
    focal: "50% 60%",
  },
  "hong-kong": {
    place: "Hong Kong",
    word: "Hong Kong",
    coords: "22.28° N, 114.16° E",
    tz: "Asia/Hong_Kong",
    photo: "https://images.unsplash.com/photo-1517449905587-f80695d63356",
    unsplashId: "y-ZMfYyXn6Y",
    photographer: "SHUJA OFFICIAL",
    photographerUrl: "https://unsplash.com/@shujaofficial",
    color: "#262626",
    accent: "oklch(76% 0.13 70)",
    focal: "50% 60%",
  },
  "jasper-sky": {
    place: "Jasper, Canada",
    word: "Jasper",
    coords: "52.87° N, 118.08° W",
    tz: "America/Edmonton",
    photo: "https://images.unsplash.com/photo-1567544568263-55b6f67b5289",
    unsplashId: "10kjsFg6M4E",
    photographer: "Andy Holmes",
    photographerUrl: "https://unsplash.com/@andyjh07",
    color: "#0c2640",
    accent: "oklch(74% 0.09 230)",
    focal: "50% 50%",
  },
  "jasper-sky-2": {
    place: "Jasper, Canada",
    word: "Jasper",
    coords: "52.87° N, 118.08° W",
    tz: "America/Edmonton",
    photo: "https://images.unsplash.com/photo-1465101046530-73398c7f28ca",
    unsplashId: "pq2DJBntZW0",
    photographer: "Jeremy Thomas",
    photographerUrl: "https://unsplash.com/@jeremythomasphoto",
    color: "#0c2659",
    accent: "oklch(72% 0.12 285)",
    focal: "50% 50%",
  },
  "jasper-sky-3": {
    place: "Jasper, Canada",
    word: "Jasper",
    coords: "52.87° N, 118.08° W",
    tz: "America/Edmonton",
    photo: "https://images.unsplash.com/photo-1482385916434-814664df9c5b",
    unsplashId: "ccxSX0f6fu8",
    photographer: "Nathan Anderson",
    photographerUrl: "https://unsplash.com/@nathananderson",
    color: "#0c2626",
    accent: "oklch(74% 0.08 200)",
    focal: "50% 50%",
  },
} satisfies Record<string, Scene>;

export type SceneId = keyof typeof scenes;

const UTM = "utm_source=sergeserbinenko.com&utm_medium=referral";

export function photoSrc(scene: Scene, width: number, height?: number): string {
  return `${scene.photo}?auto=format&fit=crop&q=72&w=${width}${height ? `&h=${height}` : ""}`;
}

export function photoSrcset(scene: Scene): string {
  return [960, 1600, 2400, 3200].map((w) => `${photoSrc(scene, w)} ${w}w`).join(", ");
}

export function photographerHref(scene: Scene): string {
  return `${scene.photographerUrl}?${UTM}`;
}

export function photoPageHref(scene: Scene): string {
  return `https://unsplash.com/photos/${scene.unsplashId}?${UTM}`;
}

export const unsplashHref = `https://unsplash.com/?${UTM}`;
