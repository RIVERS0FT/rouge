import {test,expect,type Page} from '@playwright/test';

async function noTechnicalCopy(page:Page){
 await expect(page.locator('.atlas-credit,.input-hint,.platform-note,.settings-controls,.territory-group-id')).toHaveCount(0);
 await expect(page.locator('body')).not.toContainText(/Natural Earth|Vic3|MILLER|STRATEGY LAB|CAMPAIGN ARCHIVES|ARMY DEVELOPMENT|WebGL|npm run|本地模拟|Hover, focus or tap|悬停、聚焦或轻点|右键点击|预览以两地中心/);
}

for(const language of ['zh','en'] as const)test(`${language}: concise menus and dialogs keep controls, attributes and language`,async({page})=>{
 test.setTimeout(180000);
 await page.addInitScript(language=>localStorage.setItem('rouge.language',language),language);
 await page.goto('/');
 const zh=language==='zh';
 await expect(page.locator('html')).toHaveAttribute('lang',zh?'zh-CN':'en');
 await expect(page).toHaveTitle(zh?'诸省之争':'ROUGE');
 await expect(page.locator('.menu-content h1')).toHaveText(zh?'诸省之争':'ROUGE');
 await noTechnicalCopy(page);
 // The language picker intentionally uses each language's own name.
 await expect(page.locator('.main-menu')).not.toContainText(zh?/[A-Za-z]/:/\p{Script=Han}/u);
 await page.getByTestId('single-player').click();
 await page.getByTestId('edit-player-leader').click();
 await expect(page.locator('.leader-card')).toHaveCount(3);
 await expect(page.locator('.leader-copy p')).toHaveCount(0);
 await page.keyboard.press('Escape');
 await page.getByTestId('edit-player-flag').click();
 await page.getByLabel(zh?'旗帜类型':'Flag type',{exact:true}).selectOption('custom');
 await expect(page.getByTestId('flag-drawing-surface')).toBeVisible();
 await expect(page.locator('#flag-drawing-instructions')).toHaveCount(0);
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await page.getByTestId('open-saves').click();
 await expect(page.getByRole('dialog')).toContainText(zh?'存档仅保存在当前浏览器':'Saves are stored only in this browser');
 await noTechnicalCopy(page);await page.keyboard.press('Escape');
 await page.getByTestId('single-player').click();
 await expect(page.getByTestId('commander-name')).toHaveValue(zh?'指挥官':'Commander');
 await expect(page.getByTestId('setup-ai-count')).toBeEnabled();
 await expect(page.getByRole('dialog')).not.toContainText(zh?/[A-Za-z]/:/\p{Script=Han}/u);
 await page.getByTestId('choose-unit-infantry').focus();
 await expect(page.getByRole('tooltip').locator('.unit-attribute')).toHaveCount(9);
 await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
 await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.getByTestId('toggle-pause').click();
 await expect(page.locator('.commander-rank small')).toHaveText(zh?'等级':'LV');
 await expect(page.locator('canvas')).toHaveAccessibleName(zh?'世界战场':'World theatre');
 await expect(page.locator('.production-line')).toContainText(zh?'秒':'s');
 await expect(page.locator('.province-panel')).not.toContainText(zh?/[A-Za-z]/:/\p{Script=Han}/u);
 await page.getByTestId('open-territory-management').click();
 await noTechnicalCopy(page);
 await expect(page.getByTestId('territory-management')).not.toContainText(/NE_|Revision|修订|Select complete areas|勾选要拆/);
 await page.keyboard.press('Escape');await page.getByTestId('open-upgrades').click();
 await expect(page.locator('.upgrade-card .unit-attribute')).toHaveCount(9);await noTechnicalCopy(page);
 await page.keyboard.press('Escape');await page.getByTestId('portrait-talents').click();
 await expect(page.getByRole('dialog')).toContainText(zh?'经验':'XP');await noTechnicalCopy(page);
 await page.keyboard.press('Escape');await page.getByTestId('open-settings').click();
 await expect(page.getByTestId('settings-save')).toBeEnabled();
 await expect(page.locator('.settings-status')).toContainText(zh?'已暂停':'paused');await noTechnicalCopy(page);
 await page.screenshot({path:`artifacts/concise-settings-${language}.png`});
 await page.getByTestId('settings-resume').click();await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('language changes localize untouched setup names without overwriting chosen names',async({page})=>{
 await page.goto('/');await page.getByTestId('single-player').click();
 // The menu can accept this action before the lazy game/map bundle is ready.
 await expect(page.getByTestId('commander-name')).toBeVisible({timeout:60000});
 await expect(page.getByTestId('commander-name')).toHaveValue('指挥官');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'English',exact:true}).click();await page.getByTestId('single-player').click();
 await expect(page.getByTestId('commander-name')).toHaveValue('Commander');
 await page.getByTestId('commander-name').fill('Alice 王');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'简体中文',exact:true}).click();await page.getByTestId('single-player').click();
 await expect(page.getByTestId('commander-name')).toHaveValue('Alice 王');
});

for(const language of ['zh','en'] as const)test(`${language}: LAN lobby has concise localized computer seats`,async({page})=>{
 await page.addInitScript(language=>localStorage.setItem('rouge.language',language),language);
 await page.goto('/');const zh=language==='zh';
 await page.getByRole('button',{name:zh?/局域网联机/:/LAN multiplayer/}).click();
 await page.getByTestId('setup-ai-count').fill('1');
 await page.getByRole('button',{name:zh?'创建房间':'Create room',exact:true}).click();
 await expect(page.locator('.room-code')).toHaveText(/^[A-F0-9]{6}$/);
 await expect(page.locator('.seats')).toContainText(zh?'电脑玩家 1':'Computer player 1');
 await noTechnicalCopy(page);
 await page.getByRole('button',{name:zh?'离开房间':'Leave room',exact:true}).click();
 await expect(page.getByTestId('single-player')).toBeVisible();
});
