import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  reactCompiler: true,
  async redirects() {
    return [
      {
        destination: "/future-planning",
        permanent: true,
        source: "/budgets/:path*",
      },
      {
        destination: "/future-planning",
        permanent: true,
        source: "/scenario-budgeting/:path*",
      },
      {
        destination: "/dashboard",
        permanent: true,
        source: "/reports/:path*",
      },
      {
        destination: "/transactions",
        permanent: true,
        source: "/documents/:path*",
      },
      {
        destination: "/transactions",
        permanent: true,
        source: "/people-payments/:path*",
      },
    ];
  },
};

export default nextConfig;
