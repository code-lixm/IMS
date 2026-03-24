export interface FilePickerOptions {
  accept?: string;
  multiple?: boolean;
}

export interface PickedFile {
  file: File;
  name: string;
  path: string;
}

interface PathLikeFile {
  path: unknown;
}

function hasNativePath(file: File): file is File & PathLikeFile {
  return typeof file === "object" && file !== null && "path" in file;
}

function resolvePickedFilePath(file: File) {
  if (hasNativePath(file) && typeof file.path === "string") {
    const trimmedPath = file.path.trim();
    if (trimmedPath) {
      return trimmedPath;
    }
  }

  return file.name;
}

function createPickerInput(options: FilePickerOptions) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = options.accept ?? "";
  input.multiple = options.multiple ?? true;
  return input;
}

function toPickedFile(file: File): PickedFile {
  return {
    file,
    name: file.name,
    path: resolvePickedFilePath(file),
  };
}

export async function pickFiles(options: FilePickerOptions = {}): Promise<PickedFile[]> {
  return new Promise<PickedFile[]>((resolve) => {
    const input = createPickerInput(options);
    input.onchange = () => {
      resolve(Array.from(input.files ?? []).map(toPickedFile));
    };
    input.click();
  });
}
