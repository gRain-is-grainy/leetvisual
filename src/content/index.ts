import { createController } from './controller';

createController({
  runtime: chrome.runtime,
  storage: chrome.storage.local,
  // Wrapped: calling the global fetch as a method of deps throws "Illegal invocation".
  fetch: (url, init) => fetch(url, init),
}).start();
