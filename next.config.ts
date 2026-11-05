import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["sharp", "unpdf", "mailparser", "mammoth"],
  // The demo loader (a server action on the dashboard) reads the sample
  // supplier files off disk; ship them with the dashboard's function.
  outputFileTracingIncludes: { "/": ["./public/samples/**/*"] },
};

export default nextConfig;
