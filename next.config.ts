import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "mammoth"],
  transpilePackages: ["pdfjs-dist"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
  outputFileTracingIncludes: {
    "/api/chat": [
      "./prompts/criminalista/*.md",
      "./prompts/criminalista/meta.json",
      "./data/rag/**/*",
    ],
    "/api/agents": [
      "./prompts/criminalista/*.md",
      "./prompts/criminalista/meta.json",
    ],
  },
  outputFileTracingExcludes: {
    "/api/chat": ["./prompts/criminalista/arquivos/**"],
    "/api/agents": ["./prompts/criminalista/arquivos/**"],
  },
};

export default nextConfig;
