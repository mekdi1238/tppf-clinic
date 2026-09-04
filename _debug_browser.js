const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  page.on('response', response => {
    if (!response.ok()) {
      console.log(`HTTP ERROR: ${response.status()} ${response.url()}`);
    }
  });

  try {
    await page.goto('http://localhost:3000/dashboard.html');
    await new Promise(r => setTimeout(r, 2000));
  } catch (err) {
    console.log('NAV ERROR:', err);
  } finally {
    await browser.close();
  }
})();
