// ===========================================================================
//  image.ts — shrink a photo in the browser, before it is uploaded.
//
//  WHY THIS EXISTS
//  ---------------
//  A photo straight off a phone camera is 3–8 MB and 4000 pixels wide. On a
//  dish card it is displayed about 400 pixels wide, so all of that is waste:
//  a slow upload on a phone's data, a slow page for every student afterwards,
//  and a Supabase quota eaten for nothing.
//
//  So the picture is redrawn onto a canvas at a sensible size and re-encoded
//  as JPEG before it leaves the device. A typical result is 60–150 KB — around
//  fifty times smaller, and indistinguishable at the size it is shown.
//
//  It also solves a second problem quietly: a canvas drops EXIF metadata, so
//  the GPS location a phone stamps into a photo is not published with it.
// ===========================================================================

/** The longest side of the stored picture. Dish cards show it far smaller. */
const MAX_EDGE = 1280;

/** JPEG quality. 0.82 is the usual sweet spot: no visible loss, small file. */
const QUALITY = 0.82;

/** Refuse a file this big before even trying to read it (25 MB). */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export class ImageError extends Error {}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageError("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ImageError("That file is not a picture the browser can open."));
    image.src = dataUrl;
  });
}

/**
 * Turns the file the agent picked into a small JPEG data URL, ready to POST.
 * Throws ImageError with a sentence worth showing on screen.
 */
export async function shrinkForUpload(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new ImageError("Choose a picture file (JPG, PNG or WebP).");
  if (file.size > MAX_INPUT_BYTES) throw new ImageError(`That picture is ${(file.size / 1024 / 1024).toFixed(1)} MB — too big even to open.`);

  const original = await readAsDataUrl(file);
  const image = await loadImage(original);

  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new ImageError("This browser cannot resize pictures.");

  // A white bed first, so a PNG with transparency does not come out black
  // once it is flattened into a JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const shrunk = canvas.toDataURL("image/jpeg", QUALITY);
  if (shrunk.length < 100) throw new ImageError("That picture could not be prepared. Try another one.");
  return shrunk;
}

/** Rough size of a data URL in KB, for the "82 KB" note under the picture. */
export function dataUrlKilobytes(dataUrl: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.round((base64.length * 0.75) / 1024);
}
