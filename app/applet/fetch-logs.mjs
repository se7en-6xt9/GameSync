import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    page.on('response', response => {
      if (!response.ok()) console.log('NETWORK ERROR:', response.status(), response.url());
    });
    
    await page.goto('https://melodygames.vercel.app/', { waitUntil: 'networkidle2' });
    
    await browser.close();
})();
