const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/SajadTRB/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const user = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.test' };
    const profile = { user_id: user.id, email: user.email, display_name: 'Test administrator', role: 'admin', access_mode: 'unlimited', plan_code: 'unlimited', render_limit: 100000, renders_used_week: 0, week_started_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    let refreshes = 0, patches = 0;
    await page.addInitScript(({ user }) => localStorage.setItem('vage-studio-auth', JSON.stringify({ user, access_token: 'expired-test', refresh_token: 'test-refresh', expires_at: 1 })), { user });
    await page.route('**/auth/v1/**', route => {
      refreshes++;
      return route.fulfill({ json: { user, access_token: 'new-test', refresh_token: 'new-refresh', expires_in: 3600 } });
    });
    await page.route('**/rest/v1/**', async route => {
      const url = route.request().url();
      if (url.includes('studio_subscriptions')) return route.fulfill({ status: 503, json: { message: 'Temporary test outage' } });
      if (url.includes('studio_payment_events')) return route.fulfill({ json: [] });
      if (url.includes('list_studio_admin_users')) return route.fulfill({ json: [profile] });
      if (route.request().method() === 'PATCH') { patches++; Object.assign(profile, route.request().postDataJSON()); }
      return route.fulfill({ json: [profile] });
    });
    await page.goto(process.env.STUDIO_TEST_URL || 'http://localhost:3002');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Access and quota control', { exact: true }).waitFor();
    assert.equal(refreshes, 1);
    await dialog.getByRole('textbox', { name: 'Search users' }).fill('admin@example.test');
    assert.equal(await dialog.locator('.studio-user-row').count(), 1);
    await dialog.locator('.studio-user-row select').nth(1).selectOption('creator');
    assert.equal(await dialog.locator('.studio-user-row input[type=number]').inputValue(), '5');
    await dialog.locator('.studio-user-row').getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.studio-dashboard__message')?.textContent === 'Saved');
    assert.equal(patches, 1);
    assert.equal(await dialog.locator('.studio-plan button:disabled').count(), 3);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await dialog.evaluate(el => el.getBoundingClientRect().width <= window.innerWidth));
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log('PASS: expired-session refresh, partial dashboard failure, admin email search, plan quota, save, unavailable billing, mobile dialog, Escape.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
