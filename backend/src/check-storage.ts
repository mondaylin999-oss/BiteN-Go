// ===========================================================================
//  check-storage.ts — "are the food photos actually going to work?"
//
//      cd backend
//      npm run check:storage
//
//  Uploads a tiny test picture, fetches it back the way a browser would, then
//  deletes it. Each step prints OK or the exact thing to fix, so a wrong key,
//  a missing bucket and a bucket left private are told apart instead of all
//  showing up later as "the photo just doesn't appear".
//
//  Nothing here touches PostgreSQL — this is only about Supabase Storage.
//  See README section 19 and backend/src/photos.ts.
// ===========================================================================

import { ENV } from "./env.js";
import { deleteFoodPhoto, isPhotoError, photosEnabled, uploadFoodPhoto } from "./photos.js";

/** The smallest valid JPEG-ish payload we can send: a 1x1 PNG, as a data URL,
 *  which is exactly the shape the browser sends for a real photo. */
const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const ok = (message: string) => console.log(`  OK    ${message}`);
const bad = (message: string) => console.log(`  FAIL  ${message}`);

async function main() {
  console.log("\n  Supabase Storage check");
  console.log("  --------------------------------------------------------");

  // --- 1. is it configured at all? -----------------------------------------
  if (!photosEnabled()) {
    bad("backend/.env is missing the Supabase settings, so photos are off.");
    console.log(
      "\n  The rest of the app still runs. To switch photos on, add these to\n" +
        "  backend/.env and run this again:\n\n" +
        "      SUPABASE_URL=https://<your-project-ref>.supabase.co\n" +
        "      SUPABASE_SERVICE_KEY=<the SECRET key, sb_secret_... >\n" +
        "      SUPABASE_BUCKET=food-photos\n\n" +
        "  Both values are in the Supabase dashboard under\n" +
        "  Project Settings -> API. Create the bucket under Storage, and turn\n" +
        '  "Public bucket" ON.\n',
    );
    process.exit(1);
  }

  ok(`URL     ${ENV.supabaseUrl}`);
  ok(`bucket  ${ENV.supabaseBucket}`);
  ok(`key     ${ENV.supabaseServiceKey.length} characters`);

  // The single most common mistake: pasting the publishable key, which cannot
  // write to a bucket. Worth naming before we waste a round trip on it.
  if (/publishable|anon/i.test(ENV.supabaseServiceKey)) {
    bad("SUPABASE_SERVICE_KEY looks like the PUBLISHABLE key. Uploads need the SECRET key.");
  }

  // --- 2. upload ------------------------------------------------------------
  let stored: { imageUrl: string; imagePath: string };
  try {
    stored = await uploadFoodPhoto({ dataUrl: ONE_PIXEL_PNG_DATA_URL, agentId: 0, foodItemId: 0 });
    ok(`upload  ${stored.imagePath}`);
  } catch (error) {
    bad(isPhotoError(error) ? "upload refused:" : "upload failed:");
    console.log(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  // --- 3. read it back exactly as an <img> tag would ------------------------
  // This catches a bucket left PRIVATE: the upload succeeds, because the
  // secret key may do anything, but every picture on the site is a 400.
  const response = await fetch(stored.imageUrl);
  if (response.ok) {
    ok(`public  ${stored.imageUrl}`);
  } else {
    bad(`the uploaded file is NOT publicly readable (HTTP ${response.status}).`);
    console.log(
      "\n  The upload worked, but a browser cannot load it, so dishes would\n" +
        "  show the placeholder instead of the photo. In the dashboard:\n" +
        `  Storage -> "${ENV.supabaseBucket}" -> Edit bucket -> "Public bucket" ON.\n`,
    );
  }

  // --- 4. tidy up -----------------------------------------------------------
  await deleteFoodPhoto(stored.imagePath);
  ok("cleanup removed the test file");

  console.log("  --------------------------------------------------------");
  console.log(response.ok ? "  Food photos are ready to use.\n" : "  Make the bucket public, then run this again.\n");
  process.exit(response.ok ? 0 : 1);
}

main().catch(error => {
  console.error("\n  Unexpected failure:\n ", error instanceof Error ? error.message : error, "\n");
  process.exit(1);
});
