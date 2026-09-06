import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * pdfkit loads its Helvetica font metrics from files inside its own package
   * at runtime. Bundling it breaks that lookup, so it is left external and
   * required from node_modules as-is.
   */
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
