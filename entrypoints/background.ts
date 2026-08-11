import { registerRouter } from '../src/background/router';

export default defineBackground(() => {
  registerRouter();
});
