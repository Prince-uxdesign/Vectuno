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
      <button type="button" className="app-secondary" onClick={onChangeImage} disabled={disabled}>
        Change image
      </button>
    </div>
  );
}
