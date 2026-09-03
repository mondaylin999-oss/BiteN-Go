// ===========================================================================
//  photos.ts — food photos, kept in Supabase Storage.
//
//  WHY SUPABASE AND NOT THIS SERVER
//  --------------------------------
//  A photo is a big file that never changes. Keeping it in PostgreSQL would
//  bloat every backup; keeping it on this laptop's disk would mean the picture
//  disappears the moment you run the app somewhere else. Supabase Storage
//  holds the file and hands back a permanent public link, and PostgreSQL keeps
//  only that link — a couple of hundred characters in `food_items.image_url`.
//
//  HOW THE UPLOAD GOES
//  -------------------
//      agent's browser  --(shrunk JPEG, as a data URL)-->  THIS BACKEND
//      this backend     --(secret key, never in a browser)-->  Supabase
//      this backend     --(public link)-->  PostgreSQL
//
//  The browser never holds a Supabase key and never talks to Supabase, so the
//  ordinary rule still applies and is checked in one place: an agent may only
//  put a photo on a dish that is theirs.
//
//  NO NEW PACKAGES. Supabase Storage is a plain HTTPS API and Node 20+ has
//  fetch built in, so there is nothing to install — one less thing to go wrong
//  on a fresh machine.
//
//  IF SUPABASE IS NOT CONFIGURED the app runs exactly as before: the photo
//  buttons are hidden, dishes show a placeholder, and nothing errors.
// ===========================================================================

import { ENV } from "./env.js";

export type StoredPhoto = { imageUrl: string; imagePath: string };

/** True once SUPABASE_URL and SUPABASE_SERVICE_KEY are both in backend/.env. */
export function photosEnabled() {
  return Boolean(ENV.supabaseUrl && ENV.supabaseServiceKey && ENV.supabaseBucket);
}

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB after the browser has shrunk it
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

class PhotoError extends Error {}

/** Anything the caller did wrong, phrased for the agent looking at the screen. */
function fail(message: string): never {
  throw new PhotoError(message);
}

export function isPhotoError(error: unknown) {
  return error instanceof PhotoError;
}

/**
 * "data:image/jpeg;base64,/9j/4AAQ..." → the bytes plus the file extension.
 * Rejects anything that is not one of the three image types we allow, and
 * anything too big — both checks happen here, before a single byte is sent on.
 */
function decodeDataUrl(dataUrl: string) {
  const match = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) fail("That does not look like an image file.");

  const mime = match[1]!.toLowerCase();
  const extension = ALLOWED.get(mime);
  if (!extension) fail("Use a JPG, PNG or WebP picture.");

  const bytes = Buffer.from(match[2]!.replace(/\s+/g, ""), "base64");
  if (!bytes.length) fail("That image is empty.");
  if (bytes.length > MAX_BYTES) fail(`That picture is ${(bytes.length / 1024 / 1024).toFixed(1)} MB. Keep it under 3 MB.`);

  return { bytes, mime, extension };
}

function storageBase() {
  return `${ENV.supabaseUrl.replace(/\/+$/, "")}/storage/v1/object`;
}

function authHeaders() {
  return {
    // Supabase wants the key in both places: apikey identifies the project,
    // Authorization carries the permission. The secret key bypasses row-level
    // security, which is why the bucket itself needs no policies.
    apikey: ENV.supabaseServiceKey,
    Authorization: `Bearer ${ENV.supabaseServiceKey}`,
  };
}

/**
 * Uploads one photo and returns the public link to store in PostgreSQL.
 * The path carries the agent and the dish, so anyone browsing the bucket can
 * tell at a glance whose picture is whose:
 *      food/12/45-1756789012345.jpg
 */
export async function uploadFoodPhoto(input: { dataUrl: string; agentId: number; foodItemId: number }): Promise<StoredPhoto> {
  if (!photosEnabled()) fail("Photos are switched off: set SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env.");

  const { bytes, mime, extension } = decodeDataUrl(input.dataUrl);
  const imagePath = `food/${input.agentId}/${input.foodItemId}-${Date.now()}.${extension}`;

  let response: Response;
  try {
    response = await fetch(`${storageBase()}/${ENV.supabaseBucket}/${imagePath}`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: new Uint8Array(bytes),
    });
  } catch (error) {
    fail(`Could not reach Supabase (${error instanceof Error ? error.message : "network error"}). Photos need an internet connection.`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 400 && detail.includes("Bucket not found"))
      fail(`The bucket "${ENV.supabaseBucket}" does not exist in this Supabase project. Create it under Storage, or fix SUPABASE_BUCKET in backend/.env.`);
    if (response.status === 401 || response.status === 403)
      fail("Supabase refused the key. Check SUPABASE_SERVICE_KEY in backend/.env — it must be the SECRET key, not the publishable one.");
    if (response.status === 413) fail("Supabase rejected the picture as too large. Lower the bucket's file size limit or use a smaller photo.");
    fail(`Supabase would not accept the upload (${response.status}). ${detail.slice(0, 200)}`);
  }

  // Public bucket → this link works in any <img> for ever, with no signing.
  const imageUrl = `${storageBase()}/public/${ENV.supabaseBucket}/${imagePath}`;
  return { imageUrl, imagePath };
}

/**
 * Removes the file itself. Called when a photo is replaced or taken off a
 * dish, so the bucket does not fill with pictures nothing points at.
 * A failure here is deliberately not fatal: the dish has already lost its
 * link, and one stray file is a smaller problem than a screen that will not
 * save. It is logged so it can be cleaned up by hand.
 */
export async function deleteFoodPhoto(imagePath: string | null | undefined) {
  if (!imagePath || !photosEnabled()) return;
  try {
    const response = await fetch(`${storageBase()}/${ENV.supabaseBucket}/${imagePath}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!response.ok) console.warn(`[photos] could not delete ${imagePath}: ${response.status}`);
  } catch (error) {
    console.warn(`[photos] could not delete ${imagePath}:`, error instanceof Error ? error.message : error);
  }
}
