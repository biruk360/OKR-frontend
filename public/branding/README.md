# Letterhead branding assets

The PDF renderer (`lib/letter-pdf.tsx`) looks for one of:

- `letterhead-logo.png`
- `letterhead-logo.jpg`
- `letterhead-logo.jpeg`

If a file is present, it renders top-left of every letter PDF.
If no file is present, the letterhead degrades to text-only.

**Recommended specs:**
- Square crop, 300×300 px or larger
- PNG with transparent background (so it overlays well on white)
- Under 500 KB

Drop the file here, commit, deploy.

**Company stamp (letters):**

- `eldix-stamp.png` — printed on the signature block when a Super Admin (ADMIN)
  enables **Use company stamp** on a letter. Recommended: PNG with a
  transparent background.
