import type { NextFunction, Request, Response } from "express";
import { Errors } from "../utils/app-error.js";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(options: { windowMs: number; max: number; prefix: string }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const key = `${options.prefix}:${ip}:${email}`;
    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    if (existing.count >= options.max) {
      next(Errors.tooManyRequests());
      return;
    }
    existing.count += 1;
    next();
  };
}

export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
}
