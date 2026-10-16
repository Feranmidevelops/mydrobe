import { AnnouncementBar } from '../components/landing/AnnouncementBar'
import { BodyShapes } from '../components/landing/BodyShapes'
import { FeaturedPieces } from '../components/landing/FeaturedPieces'
import { Hero } from '../components/landing/Hero'
import { SiteFooter } from '../components/landing/SiteFooter'
import { SiteHeader } from '../components/landing/SiteHeader'
import { WhyMydrobe } from '../components/landing/WhyMydrobe'
import { useWardrobeGarments } from '../hooks/useWardrobeGarments'

/** The front door: what Mydrobe is, with a way into the fitting room from every section. */
export default function LandingPage() {
  const garments = useWardrobeGarments()

  return (
    <div id="top" className="min-h-dvh bg-cream text-espresso">
      <AnnouncementBar />
      <SiteHeader />
      <main>
        <Hero />
        <FeaturedPieces garments={garments} />
        <WhyMydrobe />
        <BodyShapes />
      </main>
      <SiteFooter />
    </div>
  )
}
