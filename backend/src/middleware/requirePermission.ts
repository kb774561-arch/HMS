import type { NextFunction, Request, Response } from "express";
import type { PermissionAction } from "@prisma/client";
import { permissionService } from "../services/permissionService.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";

/**
 * Gate a route on a menu permission. Pass several routes when a screen legitimately
 * needs data owned by another module (e.g. the tenant form reads room/bed lists).
 */
export function requirePermission(menuRoute: string | string[], action: PermissionAction = "VIEW") {
  const routes = Array.isArray(menuRoute) ? menuRoute : [menuRoute];
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const allowed = await permissionService.hasAny(req.user, routes, action);
      if (!allowed) {
        throw new ForbiddenError(`You do not have ${action.toLowerCase()} access to this module`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireRoles(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.roleName)) {
      return next(new ForbiddenError("Only a Super Admin can manage this setting"));
    }
    next();
  };
}
