import type { PreviewBackground } from "../types";
import { Button } from "./ui/Button";
import { BackgroundToggle } from "./BackgroundToggle";

interface FilePreviewProps {
  previewUrl: string;
  onChangeImage: () => void;
  disabled?: boolean;
  // Only passed when the image has transparency — otherwise the backdrop
  // would be invisible and the control would be noise.
  background?: PreviewBackground;
  onBackgroundChange?: (value: PreviewBackground) => void;
}

export function FilePreview({ previewUrl, onChangeImage, disabled, background, onBackgroundChange }: FilePreviewProps) {
  const showBackground = background !== undefined && onBackgroundChange !== undefined;
  return (
    <div className="file-preview">
      <div className={`file-preview__frame${showBackground ? ` preview-bg preview-bg--${background}` : ""}`}>
        <img src={previewUrl} alt="Uploaded image preview" className="file-preview__image" />
      </div>
      {showBackground && <BackgroundToggle value={background} onChange={onBackgroundChange} />}
      <Button variant="secondary" onClick={onChangeImage} disabled={disabled}>
        Change image
      </Button>
    </div>
  );
}
