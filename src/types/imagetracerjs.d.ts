declare module "imagetracerjs" {
  interface ImageTracerImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  interface ImageTracerStatic {
    imagedataToSVG(imageData: ImageTracerImageData, options?: Record<string, unknown>): string;
  }

  const ImageTracer: ImageTracerStatic;
  export default ImageTracer;
}
