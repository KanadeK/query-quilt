import { startDistributionServer, stopDistributionServer } from '../../scripts/serve_dist.mjs';

export default async function globalSetup() {
  const server = await startDistributionServer(4180);
  return async () => {
    await stopDistributionServer(server);
  };
}
