import { registerContextMenu } from '../src/background/context-menu';
import { registerRouter } from '../src/background/router';

export default defineBackground(() => {
  registerRouter();
  registerContextMenu();
});
