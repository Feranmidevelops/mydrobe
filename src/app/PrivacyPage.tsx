import type { ReactNode } from 'react'
import { SiteFooter } from '../components/landing/SiteFooter'
import { Link } from '../components/ui/Link'
import { ROUTES } from './router'

const CONTACT = 'workwithferanmi@gmail.com'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-espresso">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-taupe [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </section>
  )
}

/** What Mydrobe keeps about you (only what's on your own device) and who to ask about it. */
export default function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-cream text-espresso">
      <header className="border-b border-espresso/10">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link to={ROUTES.home} className="text-base font-bold tracking-[0.24em] text-espresso uppercase">
            Mydrobe
          </Link>
          <Link
            to={ROUTES.fittingRoom}
            className="rounded-full bg-espresso px-4 py-2 text-sm font-medium text-cream transition hover:bg-cocoa"
          >
            Fitting room
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-espresso">Privacy</h1>
        <p className="mt-2 text-sm text-taupe">Last updated 12 November 2026</p>
        <p className="mt-6 text-base leading-relaxed text-espresso">
          Mydrobe runs in your browser. There's no account, and your photos and wardrobe never leave your device.
        </p>

        <Section title="What Mydrobe keeps, and where">
          <p>
            When you add a piece of clothing, Mydrobe works on the photo in your browser and saves it in this
            browser's own storage on this device. It keeps:
          </p>
          <ul>
            <li>
              the photo, redrawn at up to 1,600 pixels across. Redrawing it drops the details a camera hides in a
              photo file, such as where it was taken;
            </li>
            <li>a cut-out picture of the garment;</li>
            <li>the name, category and colours of the piece, and the type and size of the file you chose;</li>
            <li>the outfits you save.</li>
          </ul>
          <p>None of this is sent to Mydrobe or anyone else. There's no server that stores your wardrobe.</p>
        </Section>

        <Section title="What Mydrobe doesn't do">
          <ul>
            <li>No account or sign-in.</li>
            <li>No cookies, analytics, adverts or tracking.</li>
            <li>No requests to other websites. The fonts and everything else the site needs come from Mydrobe itself.</li>
          </ul>
        </Section>

        <Section title="The web host">
          <p>
            Like any website, Mydrobe is served by a web host, which keeps standard logs of requests to the site:
            your IP address, your browser type and the pages asked for. They never include your photos or wardrobe,
            which don't leave your device.
          </p>
        </Section>

        <Section title="Deleting your wardrobe">
          <p>
            Remove pieces and outfits in the fitting room, or clear this site's data in your browser's settings to
            delete everything at once.
          </p>
          <p>
            Your wardrobe isn't backed up or synced, so it won't appear on your other devices or browsers, and once
            it's cleared it can't be brought back. Browsers can also clear it on their own, for example when your
            device is short of space, or in Safari if you haven't visited for a while.
          </p>
        </Section>

        <Section title="Who runs Mydrobe">
          <p>
            Mydrobe is run by Feranmi. For any question about privacy, email{' '}
            <a href={`mailto:${CONTACT}`} className="font-medium text-espresso underline underline-offset-2">
              {CONTACT}
            </a>
            .
          </p>
          <p>If anything here changes, this page will say so, with a new date.</p>
        </Section>
      </main>

      <SiteFooter />
    </div>
  )
}
