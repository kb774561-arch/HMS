/**
 * Cloudflare Workers entry. Bundled by Wrangler (not by `tsc`).
 * Express listens on a virtual Node HTTP port; httpServerHandler bridges fetch → Express.
 */
import { httpServerHandler } from "cloudflare:node";
import app from "./app.js";

const PORT = 8080;

app.listen(PORT);

export default httpServerHandler({ port: PORT });
