import {expect,test} from '@playwright/test';
import pkg from '../../package.json' with {type:'json'};

test('the start menu footer and settings display one matching version with no clipped mobile text',async({page})=>{
 await page.setViewportSize({width:1440,height:960});
 await page.goto('/');
 const version=page.getByTestId('start-menu-version');
 await expect(version).toHaveText(`v${pkg.version}`);
 await expect(version.locator('data')).toHaveAttribute('value',pkg.version);
 await expect(version).toBeInViewport();
 await page.getByTestId('home-settings').click();
 await expect(page.getByRole('dialog').getByTestId('game-version')).toHaveText(`v${pkg.version}`);
 await page.getByRole('dialog').getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 await expect(version).toHaveText(`v${pkg.version}`);

 for(const [width,height] of [[360,640],[568,320]]){
  await page.setViewportSize({width,height});
  await version.scrollIntoViewIfNeeded();
  await expect(version).toBeInViewport({ratio:1});
  const placement=await version.evaluate(el=>{
   const rect=el.getBoundingClientRect(),panel=el.closest('.menu-content')!.getBoundingClientRect();
   const actions=el.previousElementSibling!.getBoundingClientRect();
   const text=el.firstElementChild!.getBoundingClientRect();
   return {within:rect.left>=panel.left&&rect.right<=panel.right&&rect.bottom<=panel.bottom,
    below:rect.top>=actions.bottom,noClipping:text.width<=rect.width&&text.height<=rect.height,
    wrapping:getComputedStyle(el).whiteSpace};
  });
  expect(placement).toEqual({within:true,below:true,noClipping:true,wrapping:'nowrap'});
 }
});
