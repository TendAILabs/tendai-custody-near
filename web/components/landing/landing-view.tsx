import { Audience } from "./audience";
import { Cta } from "./cta";
import { Footer } from "./footer";
import { Header } from "./header";
import { Hero } from "./hero";
import { How } from "./how";
import { Menu } from "./menu";
import { Moments } from "./moments";
import { Problem } from "./problem";
import { Proof } from "./proof";
import { LandingRuntime } from "./runtime";
import { Spine } from "./spine";
import { Wall } from "./wall";
import { What } from "./what";

export function LandingView({ fontClass }: { fontClass: string }) {
  return (
    <div className={`rr ${fontClass}`} data-root id="top">
      <div className="stage js" data-stage>
      <noscript>
        <style>{`.rr [data-hline],.rr [data-mline],.rr [data-load],.rr [data-reveal]{opacity:1!important;transform:none!important}`}</style>
        <p style={{ font: "16px/1.6 system-ui", padding: 32 }}>
          TendAI Custody is a prototype landing page (fictional example data). It uses a little JavaScript for motion;
          the content is readable without it.
        </p>
      </noscript>
      <Spine />
      <Header />
      <Menu />
      <main data-main>
        <Hero />
        <Wall />
        <What />
        <Problem />
        <How />
        <Moments />
        <Audience />
        <Proof />
        <Cta />
        <Footer />
      </main>
      <LandingRuntime />
      </div>
    </div>
  );
}
