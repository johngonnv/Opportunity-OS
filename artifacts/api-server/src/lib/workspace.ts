import type { Request } from "express";

export async function getCurrentWorkspace(req: Request) {
  if (!req.authUser || !req.authWorkspace) {
    throw Object.assign(new Error("Not authenticated."), { status: 401 });
  }
  return { user: req.authUser, workspace: req.authWorkspace };
}
