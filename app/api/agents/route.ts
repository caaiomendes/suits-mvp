import { listAgents } from "@/lib/agents";

export const runtime = "nodejs";

export async function GET() {
  const agents = await listAgents();
  return Response.json({ agents });
}
