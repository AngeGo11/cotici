import { Header } from './components/landing/Header';
import { Hero } from './components/landing/Hero';
import { ModeJourneys } from './components/landing/ModeJourneys';
import { DownloadBanner } from './components/landing/DownloadBanner';
import { FaqSection } from './components/landing/FaqSection';
import { Footer } from './components/landing/Footer';
import { LandingChrome } from './components/motion';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white">
      <LandingChrome />
      <Header />
      <main className="relative z-[1]">
        <Hero />
        <div className="section-line mx-auto max-w-6xl opacity-60" aria-hidden />
        <ModeJourneys />
        <div className="section-line mx-auto max-w-6xl opacity-60" aria-hidden />
        <DownloadBanner />
        <FaqSection />
      </main>
      <Footer />
    </div>
  );
}
