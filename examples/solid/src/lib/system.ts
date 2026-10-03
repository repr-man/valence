"use main";

import { hostname, platform, release } from 'node:os';

export async function getSystemSummary() {
  return { hostname: hostname(), platform: platform(), release: release() };
}
