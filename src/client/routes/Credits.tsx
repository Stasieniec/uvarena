// /credits: the pictures the power-up banners use, with author, licence and
// source, as their licences ask. Open to everyone, signed in or not. The full
// record (and what was changed in each picture) is docs/CREDITS.md.
import { Body, Header, Screen } from "../components/after/ui";

interface Credit {
  file: string;
  what: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  source: string;
  sourceName: string;
  changes: string;
}

const CREDITS: readonly Credit[] = [
  {
    file: "bibi.png",
    what: "Benjamin Netanyahu, official portrait, February 2023 (Bibi)",
    author: "Avi Ohayon, Government Press Office of Israel",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    source: "https://commons.wikimedia.org/wiki/File:Benjamin_Netanyahu,_February_2023.jpg",
    sourceName: "Wikimedia Commons",
    changes: "Cropped, background removed, scaled. Shared under CC BY-SA 3.0.",
  },
  {
    file: "milionerzy-host.png",
    what: "Hubert Urbański, host of Milionerzy, 2017 (50:50)",
    author: "Serecki (Wikimedia Commons)",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    source: "https://commons.wikimedia.org/wiki/File:Hubert_Urba%C5%84ski_2017_crop.jpg",
    sourceName: "Wikimedia Commons",
    changes: "Background removed, squared, scaled. Shared under CC BY-SA 4.0.",
  },
  {
    file: "milionerzy-logo.png",
    what: "Milionerzy logo, 2008 to 2023 (50:50)",
    author: "The show's producers; format and logo belong to Sony Pictures Television",
    license: "Not freely licensed. Used for this private class game only.",
    licenseUrl: null,
    source: "https://millionaire.fandom.com/wiki/File:Milionerzy.png",
    sourceName: "Millionaire wiki",
    changes: "Upscaled.",
  },
];

function ExtLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-you underline">
      {children}
    </a>
  );
}

export function Credits() {
  return (
    <Screen bottomBar={false}>
      <Header title="Credits" big back />
      <Body>
        <p className="m-0 text-[15px] leading-[22px] text-muted">Pictures used in the power-up banners.</p>
        {CREDITS.map((c) => (
          <article key={c.file} className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-3.5 border-b border-line py-3.5">
            <img src={`/powerups/${c.file}`} alt="" width={56} height={56} loading="lazy" className="size-14 bg-plate object-contain" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 className="m-0 text-base leading-[22px] font-semibold">{c.what}</h2>
              <dl className="m-0 grid grid-cols-[64px_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-sm leading-5">
                <dt className="text-muted">Author</dt>
                <dd className="m-0 [overflow-wrap:anywhere]">{c.author}</dd>
                <dt className="text-muted">Licence</dt>
                <dd className="m-0 [overflow-wrap:anywhere]">{c.licenseUrl ? <ExtLink href={c.licenseUrl}>{c.license}</ExtLink> : c.license}</dd>
                <dt className="text-muted">Source</dt>
                <dd className="m-0 [overflow-wrap:anywhere]">
                  <ExtLink href={c.source}>{c.sourceName}</ExtLink>
                </dd>
                <dt className="text-muted">Changes</dt>
                <dd className="m-0 [overflow-wrap:anywhere]">{c.changes}</dd>
              </dl>
            </div>
          </article>
        ))}
      </Body>
    </Screen>
  );
}
