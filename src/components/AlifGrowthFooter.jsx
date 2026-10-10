const BRAND_URL = 'https://alif-growth-media.vercel.app/';

export default function AlifGrowthFooter() {
  return (
    <footer
      aria-label="Powered by Alif Growth Media"
      className="border-t border-border bg-card/70 px-4 py-4"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
        <a
          href={BRAND_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit Alif Growth Media website"
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src="/alif-growth-media.svg"
            alt="Alif Growth Media logo"
            width="40"
            height="38"
            loading="lazy"
            className="h-9 w-10 object-contain"
          />
        </a>
        <p className="text-center text-xs text-muted-foreground">
          Powered by{' '}
          <a
            href={BRAND_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Alif Growth Media
          </a>
        </p>
      </div>
    </footer>
  );
}
