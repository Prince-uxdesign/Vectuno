import { Button } from "./ui/Button";

interface FilePreviewProps {
  previewUrl: string;
  onChangeImage: () => void;
  disabled?: boolean;
}

export function FilePreview({ previewUrl, onChangeImage, disabled }: FilePreviewProps) {
  return (
    <div className="file-preview">
      <div className="file-preview__frame">
        <img src={previewUrl} alt="Uploaded image preview" className="file-preview__image" />
      </div>
      <Button variant="secondary" onClick={onChangeImage} disabled={disabled}>
        Change image
      </Button>
    </div>
  );
}
