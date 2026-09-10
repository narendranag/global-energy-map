import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 9: /about became /methodology (sources, coverage, scenario method,
  // how to cite). Permanent so old links and citations keep resolving.
  redirects() {
    return Promise.resolve([{ source: "/about", destination: "/methodology", permanent: true }]);
  },
};

export default nextConfig;
