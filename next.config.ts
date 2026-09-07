import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "mammoth"],
  outputFileTracingIncludes: {
    "/api/chat": ["./prompts/**/*"],
    "/api/agents": ["./prompts/**/*"],
  },
};

export default nextConfig;
