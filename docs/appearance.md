# Broadcast appearance

Open **Settings** using the corner controls or **S**. Settings are fullscreen,
monospace and monochrome; the broadcast color profile applies only to the picture.
Use **Escape**, the close button, or **Return to broadcast** to leave settings.

**Show album artwork** defaults to on. Turning it off gives metadata the full
content width and places available label, catalog and year below the album.
The station sleeve is also hidden.

Artist, song title and album have independent font and size controls. Defaults
remain DM Mono at 36 / 96 / 36 pixels in the 1440 × 960 reference picture.
Actual sizes scale with the viewport. Artist and album sizes range from 24–64;
title sizes range from 48–144. Text wraps, then shrinks within its allotted space
and finally truncates when needed. Long titles can scroll when picture motion
is enabled and reduced motion is off. Secondary labels keep their original sizes.
Preferences persist in browser storage; **Restore defaults** resets appearance
and picture controls together.

## Adding local fonts

Use the existing `public/fonts/` directory. Registration is explicit; files are
not automatically discovered. No separate directory or font upload UI is needed.

1. Add a browser-compatible upright `.ttf`, `.otf`, `.woff` or `.woff2`
   font file to `public/fonts/`. Include its license and use a font with the
   characters needed by your broadcast metadata.
2. Add one entry to `BROADCAST_FONTS` in `src/lib/fonts.ts`:

   ```ts
   { id: "my-font", label: "My Font", source: "/fonts/my-font.woff2" },
   ```

   Keep IDs unique and stable. IDs are saved in browser preferences. Use a local
   `/fonts/` URL and register each face you want to select as its own entry.
3. In development, saving the catalog triggers Next.js refresh; reload the page
   if an existing font file was replaced. No server restart is required.
   Production changes require rebuilding and redeploying with the new catalog
   and public assets. Docker and `npm start` include the public directory.
4. Open Settings and select the new font for artist, song title or album. Fonts
   load on selection and update the Pixi picture as soon as loading completes.

To remove a font, delete its catalog entry and file, then refresh development
or rebuild production. Saved IDs absent from the catalog reset to DM Mono.
A registered file that is missing, invalid or times out uses system monospace;
the picture continues loading. A failed load is cached for the session, so reload
after repairing it. Settings typography stays independent of these selections.

## Review on the target iPad

Use the task's isolated mock preview URL from `.herdr-task/preview.json` on the
same LAN or tailnet. Check landscape and portrait, artwork on/off, all registered
fonts across all three metadata fields at their size limits, and the long-title
mock transmission with motion on/off. Check touch sliders, settings scrolling,
Return to broadcast, restored
preferences after reload, and hardware-keyboard Tab / Shift-Tab / Escape if
available. Desktop viewport checks do not establish actual iPad Safari behavior.
