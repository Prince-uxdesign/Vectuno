import type { CSSProperties } from "react";

// public/ assets are served at BASE_URL, not always "/" — a literal
// "/showcase/..." string would 404 under a subpath deploy (e.g. GitHub
// Pages project sites).
const SHOWCASE_BASE_URL = `${import.meta.env.BASE_URL}showcase/`;

interface ShowcaseImage {
  file: string;
  alt: string;
  /** Rotation in degrees and vertical offset in px, applied at desktop/tablet scale. */
  rotate: number;
  offsetY: number;
}

const IMAGES: ShowcaseImage[] = [
  { file: "showcase-01", alt: "Flat black cat character illustration on a yellow background", rotate: -6, offsetY: 12 },
  {
    file: "showcase-02",
    alt: "Line illustration of a person in a hoodie and sunglasses sitting with a coffee cup",
    rotate: 3,
    offsetY: -16,
  },
  { file: "showcase-03", alt: "Geometric pattern made of green, yellow, and blue shapes", rotate: -3, offsetY: 8 },
  {
    file: "showcase-04",
    alt: "Three panels of minimal cartoon faces in blue, pink, and orange",
    rotate: 0,
    offsetY: -20,
  },
  { file: "showcase-05", alt: "Illustration of a classic mobile phone on an orange background", rotate: 4, offsetY: 6 },
  {
    file: "showcase-06",
    alt: "Illustration of a hand adjusting a car rearview mirror reflecting a road",
    rotate: -4,
    offsetY: -10,
  },
  { file: "showcase-07", alt: "Colorful keyboard keys illustration spelling the word hello", rotate: 6, offsetY: 14 },
];

export function ImageShowcase() {
  return (
    <div className="showcase" role="group" aria-label="Example artwork designers convert with Vectuno">
      <ul className="showcase__track">
        {IMAGES.map((img, i) => (
          <li
            key={img.file}
            className="showcase__card"
            style={
              {
                "--r": `${img.rotate}deg`,
                "--ty": `${img.offsetY}px`,
                "--z": i,
              } as CSSProperties
            }
          >
            <img
              className="showcase__image"
              src={`${SHOWCASE_BASE_URL}${img.file}.webp`}
              srcSet={`${SHOWCASE_BASE_URL}${img.file}.webp 480w, ${SHOWCASE_BASE_URL}${img.file}@2x.webp 960w`}
              sizes="(max-width: 767px) 40vw, (max-width: 1023px) 160px, 200px"
              alt={img.alt}
              width={480}
              height={480}
              loading={i < 3 ? "eager" : "lazy"}
              fetchPriority={i < 3 ? "high" : undefined}
              decoding="async"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
