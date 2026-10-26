/** Ambient types for Cloudflare Workers virtual modules used by src/worker.ts. */
declare module "cloudflare:node" {
  export function httpServerHandler(
    options: { port: number } | object,
  ): { fetch(request: Request, env: unknown, ctx: unknown): Response | Promise<Response> };
}
