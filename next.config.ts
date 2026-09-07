import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "mammoth"],
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
