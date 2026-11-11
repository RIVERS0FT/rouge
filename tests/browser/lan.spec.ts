import {waitForRuntime} from './readiness.ts';
import {test,expect} from '@playwright/test';

test('two humans in isolated browser sessions join LAN, issue independent upgrades and reconnect',async({browser})=>{
  // Two independent software-rendered maps, three cold starts and a full reload.
  // Keep both real renderers active, at a representative desktop viewport.
  test.setTimeout(240000);
  const options={viewport:{width:960,height:640}};
  const hostContext=await browser.newContext(options),guestContext=await browser.newContext(options);
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  const errors:string[]=[];
  for(const page of [host,guest])page.on('pageerror',error=>errors.push(error.message));
  try{
    for(const [page,name] of [[host,'Host'],[guest,'Guest']] as const){
      await page.goto('/');
      await page.getByRole('button',{name:'English',exact:true}).click();
      await page.getByRole('button',{name:/LAN multiplayer/}).click();await waitForRuntime(page);
      if(name==='Guest'){
        await page.getByTestId('edit-player-leader').click();
        await page.getByTestId('choose-leader-vanguard').click();
        await page.keyboard.press('Escape');
        await page.getByTestId('edit-player-flag').click();
        await page.getByLabel('Flag type',{exact:true}).selectOption('jp');
        await page.keyboard.press('Escape');
      }
      await page.getByTestId('commander-name').fill(name);
      await expect(page.locator('.leader-card')).toHaveCount(0);
      await expect(page.getByTestId('flag-editor')).toHaveCount(0);
    }
    const [created]=await Promise.all([
      host.waitForResponse(r=>r.url().endsWith('/api/rooms')&&r.request().method()==='POST'),
      host.getByRole('button',{name:'Create room',exact:true}).click(),
    ]);
    expect(created.status(),await created.text()).toBe(201);
    await expect(host.locator('.room-code')).toHaveText(/^[A-F0-9]{6}$/);
    const code=(await host.locator('.room-code').innerText()).trim();
    await host.getByTestId('lobby-ai-count').fill('4');
    await host.getByTestId('apply-lobby-ai').click();
    await expect(host.locator('.seat')).toHaveCount(5);
    await expect(host.getByTestId('lobby-human-count')).toContainText('Humans online: 1');
    await expect(host.getByRole('button',{name:/Start match/})).toBeDisabled();
    await guest.getByPlaceholder('Room code').fill(code);
    await guest.getByRole('button',{name:'Join room',exact:true}).click();
    await expect(host.locator('.seats')).toContainText('Guest');
    for(const page of [host,guest]){
      const guestSeat=page.locator('.seat').filter({hasText:'Guest'});
      await expect(guestSeat.getByRole('img',{name:'Japan',exact:true})).toBeVisible();
    }
    await expect(host.locator('.seat')).toHaveCount(6);
    await expect(host.getByTestId('lobby-human-count')).toContainText('Humans online: 2');
    await expect(host.getByRole('button',{name:/Start match/})).toBeEnabled();
    // Reserved seats and AI never satisfy the online-human requirement.
    await guest.goto('about:blank');
    await expect(host.getByTestId('lobby-human-count')).toContainText('Humans online: 1');
    await expect(host.locator('.seat').filter({hasText:'Guest'})).toContainText('Offline');
    await expect(host.getByRole('button',{name:/Start match/})).toBeDisabled();
    await guest.goto('/');await guest.getByRole('button',{name:/Rejoin LAN room/}).click();await waitForRuntime(guest);
    await expect(host.getByTestId('lobby-human-count')).toContainText('Humans online: 2');
    await host.getByRole('button',{name:/Start match/}).click();
    await expect(host.locator('.commander-player')).toContainText('Host');
    await expect(guest.locator('.commander-player')).toContainText('Guest');
    await expect(guest.locator('.province-owner')).toContainText('Guest');
    await expect(host.getByTestId('commander-portrait')).toHaveAttribute('data-leader','warden');
    await expect(guest.getByTestId('commander-portrait')).toHaveAttribute('data-leader','vanguard');
    await expect(guest.getByTestId('faction-identity').getByRole('img',{name:'Japan',exact:true})).toBeVisible();
    await expect(guest.getByTestId('faction-identity')).toHaveAttribute('data-actor','1');
    await expect(guest.getByTestId('country-flag')).toHaveCount(0);
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
    await guest.getByRole('button',{name:/Rejoin LAN room/}).click();await waitForRuntime(guest);
    await expect(guest.locator('.app')).toHaveClass(/is-game/,{timeout:30000});
    await expect(guest.locator('.commander-player')).toContainText('Guest');
    await expect(guest.getByTestId('commander-portrait')).toHaveAttribute('data-leader','vanguard');
    await expect(guest.getByTestId('faction-identity').getByRole('img',{name:'Japan',exact:true})).toBeVisible();
    await guest.getByTestId('open-upgrades').click();
    await expect(guest.locator('.upgrade-card').first()).toContainText('1/8');
    expect(errors).toEqual([]);
  }finally{
    // Preserve the original assertion error if a timed-out browser is already closed.
    await Promise.allSettled([hostContext.close(),guestContext.close()]);
  }
});
