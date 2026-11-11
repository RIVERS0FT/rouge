import {expect,type Page} from '@playwright/test';

/** Early menu actions may precede the background runtime download. Wait for
 * that explicit handoff, not for an arbitrary setup assertion's 5s timeout. */
export async function waitForRuntime(page:Page,timeout=30000){
 await expect(page.locator('.app')).toHaveAttribute('data-resource-state','ready',{timeout});
}
