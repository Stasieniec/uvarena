// /credits: the pictures the power-up banners use, with author, licence and
// source, as their licences ask. Open to everyone, signed in or not. The full
// record (and what was changed in each picture) is docs/CREDITS.md.
import { Link } from "react-router";
import { buttonClass } from "../components/ui";

interface Credit {
  file: string;
  what: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  source: string;
  changes: string;
}

const CREDITS: readonly Credit[] = [
  {
    file: "bibi.png",
    what: "Benjamin Netanyahu, official portrait, February 2023 (the Bibi power-up)",
    author: "Avi Ohayon, Government Press Office of Israel",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    source: "https://commons.wikimedia.org/wiki/File:Benjamin_Netanyahu,_February_2023.jpg",
    changes: "Cropped, background removed, scaled. This version is shared under CC BY-SA 3.0.",
  },
  {
    file: "milionerzy-host.png",
    what: "Hubert Urbański, host of Milionerzy, 2017 (the 50:50 power-up)",
    author: "Serecki (Wikimedia Commons)",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    source: "https://commons.wikimedia.org/wiki/File:Hubert_Urba%C5%84ski_2017_crop.jpg",
    changes: "Background removed, squared, scaled. This version is shared under CC BY-SA 4.0.",
  },
  {
    file: "milionerzy-logo.png",
    what: "Milionerzy logo, 2008 to 2023 (the 50:50 power-up)",
    author: "The show's producers; the format and logo belong to Sony Pictures Television",
    license: "Not freely licensed. Used for this private class game only.",
    licenseUrl: null,
    source: "https://millionaire.fandom.com/wiki/File:Milionerzy.png",
    changes: "Upscaled.",
  },
];

function ExtLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="break-all text-you underline">
      {children}
    </a>
  );
}

export function Credits() {
  return (
    <main className="flex min-h-dvh flex-col gap-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8">
      <h1 className="font-display text-3xl font-bold">Credits</h1>
      <p className="text-sm text-muted">Pictures used in the power-up banners.</p>
      <ul className="flex flex-col gap-3">
        {CREDITS.map((c) => (
          <li key={c.file} className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm leading-snug">
            <p className="font-semibold">{c.what}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted">Author</dt>
              <dd>{c.author}</dd>
              <dt className="text-muted">Licence</dt>
              <dd>{c.licenseUrl ? <ExtLink href={c.licenseUrl}>{c.license}</ExtLink> : c.license}</dd>
              <dt className="text-muted">Source</dt>
              <dd>
                <ExtLink href={c.source}>{c.source.replace(/^https:\/\//, "")}</ExtLink>
              </dd>
              <dt className="text-muted">Changes</dt>
              <dd>{c.changes}</dd>
            </dl>
          </li>
        ))}
      </ul>
      <Link to="/" className={buttonClass("secondary", "mt-2")}>
        Back
      </Link>
    </main>
  );
}
