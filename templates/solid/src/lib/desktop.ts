'use main';

import { hostname, platform } from 'node:os';

export async function getDesktopInfo() {
  return { hostname: hostname(), platform: platform() };
}
