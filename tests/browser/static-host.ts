import {test as base} from '@playwright/test';

export * from '@playwright/test';

/** Exercise the single-player deployment served by a static host, such as Pages. */
export const test = base.extend({
 context: async ({context}, use) => {
  await context.route('**/api/health', route => route.fulfill({status:404, body:''}));
  await use(context);
 },
});
