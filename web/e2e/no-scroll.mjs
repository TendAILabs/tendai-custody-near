// Measures the guided-mode overflow: short pages must not scroll.
// node e2e/no-scroll.mjs http://127.0.0.1:3000
// Requires playwright-core on NODE_PATH and a local Chrome.

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const routes = ["/patient", "/hospital", "/reyes", "/demo", "/patient/timeline"];
const modes = ["explore", "guided"];
const viewports = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1626, height: 944 },
  { width: 375, height: 812 },
];

const playwright = process.env.PLAYWRIGHT_CORE
  ? await import(process.env.PLAYWRIGHT_CORE)
  : await import("playwright-core");
const chromium = playwright.chromium ?? playwright.default.chromium;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const failures = [];
let checked = 0;
let fitted = 0;

try {
  for (const mode of modes) {
    const context = await browser.newContext();
    await context.addInitScript((guided) => {
      localStorage.setItem("rr-intro-seen", "1");
      localStorage.setItem("rr-guided", guided ? "1" : "0");
    }, mode === "guided");
    const page = await context.newPage();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        checked += 1;
        const label = `${mode} ${viewport.width}x${viewport.height} ${route}`;
        await page.goto(base + route, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-story-ready='true']", { timeout: 15000 });
        await page.waitForFunction(
          (guided) => {
            const dash = document.querySelector(".dash");
            if (!dash) return false;
            const on = dash.classList.contains("guided");
            return guided ? on : !on;
          },
          mode === "guided",
          { timeout: 15000 },
        );
        const measured = await page.evaluate(() => {
          const doc = document.documentElement;
          const main = document.querySelector("main");
          const stage = document.querySelector(".c2-stage");
          if (!main || !stage) return { error: "missing stage" };
          const cs = getComputedStyle(stage);
          const pad = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom);
          const marginTop = Number.parseFloat(cs.marginTop);
          const marginBottom = Number.parseFloat(cs.marginBottom);
          let siblings = 0;
          for (const child of stage.children) {
            if (child.tagName === "MAIN") continue;
            siblings += child.offsetHeight;
          }
          const footer = document.querySelector(".c2-foot");
          const footerFixed = footer ? getComputedStyle(footer).position === "fixed" : true;
          const footerH = footer && !footerFixed ? footer.offsetHeight : 0;
          const content = main.offsetHeight + siblings + pad;
          const used = marginTop + marginBottom + content + footerH;
          const fits = used <= window.innerHeight + 1;
          const overflows = doc.scrollHeight > window.innerHeight + 1;
          const stepper = document.querySelector(".c2-stepper");
          const stepperOverflow = stepper ? stepper.scrollWidth > stepper.clientWidth + 1 : false;
          return {
            fits,
            overflows,
            used: Math.round(used),
            inner: window.innerHeight,
            scroll: doc.scrollHeight,
            main: main.offsetHeight,
            stepperOverflow,
            guided: document.querySelector(".dash")?.classList.contains("guided") ?? false,
          };
        });
        if (measured.error) {
          failures.push(`${label}: ${measured.error}`);
          continue;
        }
        if (measured.fits) fitted += 1;
        if (measured.fits && measured.overflows) {
          failures.push(`${label}: content ${measured.used}px fits in ${measured.inner}px but scrollHeight is ${measured.scroll}`);
        }
        if (mode === "guided" && measured.stepperOverflow) {
          failures.push(`${label}: stepper is wider than its bar`);
        }
        if (mode === "guided" && !measured.guided) {
          failures.push(`${label}: guided class missing`);
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`scroll cases=${checked} fitted=${fitted} failures=${failures.length}`);
for (const failure of failures) console.log(`FAIL ${failure}`);
if (fitted === 0) {
  console.log("FAIL no case had content shorter than the viewport, so the overflow check never ran");
  process.exit(1);
}
if (failures.length) process.exit(1);
