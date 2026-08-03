/** Calque visuel global — grain + lueurs ambiantes */
export function LandingChrome() {
  return (
    <>
      <div className="grain-overlay pointer-events-none fixed inset-0 z-[100]" aria-hidden />
      <div
        className="pointer-events-none fixed -left-[20%] top-[10%] z-0 h-[50vh] w-[50vw] rounded-full bg-brand/[0.07] blur-[120px] animate-orb-drift"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -right-[15%] top-[45%] z-0 h-[45vh] w-[45vw] rounded-full bg-accent/[0.08] blur-[100px] animate-orb-drift-reverse"
        aria-hidden
      />
    </>
  );
}
