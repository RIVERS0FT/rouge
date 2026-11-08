import {test,expect} from '@playwright/test';

test('two isolated browser sessions join LAN, issue independent upgrades and reconnect',async({browser})=>{
  // Two independent software-rendered world maps plus a full reload in CI.
  test.setTimeout(180000);
  const hostContext=await browser.newContext(),guestContext=await browser.newContext();
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  const errors:string[]=[];
  for(const page of [host,guest])page.on('pageerror',error=>errors.push(error.message));
  try{
    for(const [page,name] of [[host,'Host'],[guest,'Guest']] as const){
      await page.goto('http://127.0.0.1:5173/');
      await page.getByRole('button',{name:'English',exact:true}).click();
      await page.getByRole('button',{name:/LAN multiplayer/}).click();
      await page.getByTestId('commander-name').fill(name);
      if(name==='Guest')await page.locator('.leader-card').nth(1).click();
    }
    const [created]=await Promise.all([
      host.waitForResponse(r=>r.url().endsWith('/api/rooms')&&r.request().method()==='POST'),
      host.getByRole('button',{name:'Create room',exact:true}).click(),
    ]);
    expect(created.status(),await created.text()).toBe(201);
    await expect(host.locator('.room-code')).toHaveText(/^[A-F0-9]{6}$/);
    const code=(await host.locator('.room-code').innerText()).trim();
    await guest.getByPlaceholder('Room code').fill(code);
    await guest.getByRole('button',{name:'Join room',exact:true}).click();
    await expect(host.locator('.seats')).toContainText('Guest');
    await host.getByRole('button',{name:/Start match/}).click();
    await expect(host.locator('.hud-top')).toContainText('Host');
    await expect(guest.locator('.hud-top')).toContainText('Guest');
    await expect(guest.locator('.province-owner')).toContainText('Guest');
    await expect(host.getByTestId('commander-portrait')).toHaveAttribute('data-leader','warden');
    await expect(guest.getByTestId('commander-portrait')).toHaveAttribute('data-leader','vanguard');
    await expect(guest.getByTestId('country-identity')).toHaveAttribute('data-actor','1');
    await expect(guest.getByTestId('country-flag')).toHaveAttribute('data-country','DEU');
    await guest.getByTestId('open-settings').click();
    await expect(guest.getByTestId('settings-save')).toBeDisabled();
    const tick=Number(await guest.getByTestId('game-clock').getAttribute('data-tick'));
    await expect.poll(async()=>Number(await guest.getByTestId('game-clock').getAttribute('data-tick'))).toBeGreaterThan(tick);
    await guest.getByTestId('settings-resume').click();
    await guest.getByTestId('open-upgrades').click();
    await guest.getByTestId('upgrade-infantry-attack').click();
    await expect(guest.locator('.upgrade-card').first()).toContainText('1/8');
    await host.getByTestId('open-upgrades').click();
    await expect(host.locator('.upgrade-card').first()).not.toContainText('1/8');
    await guest.reload();
    await guest.getByRole('button',{name:/Rejoin LAN room/}).click();
    await expect(guest.locator('.hud-top')).toContainText('Guest');
    await expect(guest.getByTestId('commander-portrait')).toHaveAttribute('data-leader','vanguard');
    await guest.getByTestId('open-upgrades').click();
    await expect(guest.locator('.upgrade-card').first()).toContainText('1/8');
    expect(errors).toEqual([]);
  }finally{
    await hostContext.close();await guestContext.close();
  }
});
