export type FileLoaderProps = {
  onFilePickHandler: (file: File) => void;
  dragOver: boolean;
  setDragOver: (val: boolean) => void;
};
