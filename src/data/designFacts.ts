export type FactCategory =
  | "svg"
  | "vector"
  | "typography"
  | "color"
  | "branding"
  | "illustration"
  | "photography"
  | "ui"
  | "history"
  | "digital"
  | "print"
  | "design";

export interface DesignFact {
  id: string;
  category: FactCategory;
  text: string;
}

// Shown one at a time while a conversion is running (see useRotatingFact).
// Keep entries short, accurate, and easy to verify — no invented statistics
// or marketing claims disguised as trivia. Add more here as needed; nothing
// else needs to change to pick them up.
export const DESIGN_FACTS: DesignFact[] = [
  {
    id: "svg-scalable",
    category: "svg",
    text: "SVG stands for Scalable Vector Graphics — the format can scale to any size without losing sharpness.",
  },
  {
    id: "svg-xml",
    category: "svg",
    text: "SVG files are XML-based text, so their shapes can be styled and animated directly with CSS.",
  },
  {
    id: "svg-filesize",
    category: "svg",
    text: "An SVG's file size depends on how complex its shapes are, not on its pixel dimensions.",
  },
  {
    id: "svg-history",
    category: "svg",
    text: "SVG was first published as an official W3C recommendation in 2001.",
  },
  {
    id: "vector-paths",
    category: "vector",
    text: "Vector graphics store shapes as mathematical paths instead of a fixed grid of pixels.",
  },
  {
    id: "vector-scale",
    category: "vector",
    text: "A vector logo can be printed on a business card or a billboard from the exact same file.",
  },
  {
    id: "vector-bezier",
    category: "vector",
    text: "Bézier curves, the building block of most vector paths, are named after French engineer Pierre Bézier.",
  },
  {
    id: "raster-limit",
    category: "digital",
    text: "Raster images are resolution-dependent — enlarge one too far and the individual pixels become visible.",
  },
  {
    id: "typography-serif",
    category: "typography",
    text: "Serif fonts get their name from the small strokes finishing the edges of each letter.",
  },
  {
    id: "typography-helvetica",
    category: "typography",
    text: "Helvetica was originally released in 1957 under the name Neue Haas Grotesk.",
  },
  {
    id: "typography-kerning",
    category: "typography",
    text: "Kerning adjusts the space between two specific letters — tracking adjusts spacing across a whole line.",
  },
  {
    id: "typography-typeface",
    category: "typography",
    text: "A typeface is a whole family of fonts; a font is one specific weight and size within that family.",
  },
  {
    id: "color-cmyk",
    category: "color",
    text: "CMYK printing is subtractive — it works by removing light from white paper, not adding it.",
  },
  {
    id: "color-rgb",
    category: "color",
    text: "RGB is additive: combining red, green, and blue light at full intensity produces white.",
  },
  {
    id: "color-pantone",
    category: "color",
    text: "Pantone's matching system assigns each color a specific number so it can be reproduced identically anywhere.",
  },
  {
    id: "color-newton",
    category: "color",
    text: "Isaac Newton created one of the first color wheels, published in his 1704 book Opticks.",
  },
  {
    id: "branding-wordmark",
    category: "branding",
    text: "A wordmark is a logo built entirely from a company's name set in a custom typeface.",
  },
  {
    id: "branding-fedex",
    category: "branding",
    text: "The FedEx logo hides an arrow in the negative space between the letters 'E' and 'x'.",
  },
  {
    id: "branding-monogram",
    category: "branding",
    text: "A monogram logo uses initials instead of a full name — Chanel's interlocking C's are a classic example.",
  },
  {
    id: "branding-rand",
    category: "history",
    text: "Designer Paul Rand created the IBM, UPS, and ABC logos, all of which are still in use today.",
  },
  {
    id: "illustration-flat",
    category: "illustration",
    text: "Flat design deliberately avoids gradients and shadows to keep shapes simple and legible at any size.",
  },
  {
    id: "illustration-lineart",
    category: "illustration",
    text: "Line art describes form using contour alone, without any shading.",
  },
  {
    id: "photography-etymology",
    category: "photography",
    text: "The word 'photography' comes from Greek roots meaning 'drawing with light.'",
  },
  {
    id: "photography-aspect",
    category: "photography",
    text: "An image's aspect ratio is the proportional relationship between its width and height.",
  },
  {
    id: "ui-wireframe",
    category: "ui",
    text: "A wireframe is a low-fidelity layout used to plan structure before visual design begins.",
  },
  {
    id: "ui-grid",
    category: "ui",
    text: "Many UI design systems space elements in multiples of 8 pixels to keep layouts visually consistent.",
  },
  {
    id: "ui-whitespace",
    category: "ui",
    text: "Designers treat white space as an active element — it guides the eye as much as any shape does.",
  },
  {
    id: "ui-contrast",
    category: "ui",
    text: "Contrast ratio measures how readable text is against its background, and sits at the center of most accessibility guidelines.",
  },
  {
    id: "history-at-symbol",
    category: "history",
    text: "The @ symbol predates email by centuries — merchants once used it to mean 'at a rate of.'",
  },
  {
    id: "history-bauhaus",
    category: "history",
    text: "The Bauhaus school, founded in 1919, pushed the idea that a design's form should serve its function.",
  },
  {
    id: "print-cmyk-layers",
    category: "print",
    text: "CMYK printing builds full color from just four ink layers: cyan, magenta, yellow, and black.",
  },
  {
    id: "print-bleed",
    category: "print",
    text: "A 'bleed' is artwork extended past the trim line so a printed page has no unprinted edge.",
  },
  {
    id: "digital-favicon",
    category: "digital",
    text: "The favicon — the small icon in a browser tab — was introduced by Internet Explorer in 1999.",
  },
  {
    id: "design-grids",
    category: "design",
    text: "Grid systems have been used to structure page layouts since long before graphic design was a named profession.",
  },
  {
    id: "design-negative-space",
    category: "design",
    text: "Negative space is the area around and between a design's subject — sometimes it forms a second image entirely.",
  },
  {
    id: "branding-tagline",
    category: "branding",
    text: "A tagline is a short phrase meant to capture a brand's promise in just a few memorable words.",
  },
  {
    id: "color-perception",
    category: "color",
    text: "The human eye can distinguish roughly a million colors, though most people can only name a small fraction of them.",
  },
  {
    id: "vector-editable",
    category: "vector",
    text: "Because vector paths stay editable, individual shapes and colors can be changed after the file is created.",
  },
  {
    id: "svg-transparency",
    category: "svg",
    text: "SVG supports true transparency, so traced artwork can keep an alpha channel instead of a solid background.",
  },
  {
    id: "typography-em-dash",
    category: "typography",
    text: "The em dash takes its name from historically being about as wide as the letter M in a given typeface.",
  },
];
