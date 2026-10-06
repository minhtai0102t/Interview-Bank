import { getAuth } from "@/lib/auth";

// Resolved per request: the settings come from the environment, which `next build` must not need.
export const GET = (request: Request) => getAuth().handler(request);
export const POST = (request: Request) => getAuth().handler(request);
