import { registerActiveTabCleanup } from '../src/background/active-tabs';
import { registerRouter } from '../src/background/router';

export default defineBackground(() => {
  registerRouter();
  registerActiveTabCleanup();
});
